import os
import re
import json
import shutil
import argparse
import tempfile
import nest_asyncio
from datetime import datetime
from typing import Optional, Tuple, Dict, Any, List

import requests
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

import fitz  # PyMuPDF
from llama_parse import LlamaParse
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from a .env file if present
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    # If python-dotenv is not installed or any error occurs, skip silently.
  pass


# Ensure event loop compatibility in environments that may already have a loop
nest_asyncio.apply()


class ProcessingResult(BaseModel):
    pdf_path: str
    markdown_file: str
    json_file: str
    images_dir: str
    authors: List[Dict[str, str]]
    doi: Optional[str] = None


def ensure_env_vars() -> None:
    required_vars = ["LLAMA_CLOUD_API_KEY", "OPENROUTER_API_KEY"]
    missing = [v for v in required_vars if not os.getenv(v)]
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )


def create_work_dir(base_dir: Optional[str] = None) -> str:
    root = base_dir or os.path.join(os.getcwd(), "runs")
    os.makedirs(root, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
    work_dir = os.path.join(root, stamp)
    os.makedirs(work_dir, exist_ok=True)
    return work_dir


def download_pdf_from_url(pdf_url: str, download_dir: str) -> str:
    os.makedirs(download_dir, exist_ok=True)
    parsed_filename = pdf_url.split("?")[0].split("/")[-1]
    if not parsed_filename or "." not in parsed_filename:
        parsed_filename = "downloaded_pdf.pdf"
    dest_path = os.path.join(download_dir, parsed_filename)

    with requests.get(pdf_url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            shutil.copyfileobj(r.raw, f)
    return dest_path


def convert_pdf_to_markdown_with_llama(pdf_path: str) -> str:
    parser = LlamaParse(
        extract_charts=True,
        high_res_ocr=True,
        hide_headers=True,
        hide_footers=True,
        two_column_layout=True,
        aggressive_title_filter=True,
        deduplicate_repeated_lines=True,
        result_type="markdown",
        model="openai-gpt-4-1-mini",
        output_tables_as_HTML=True,
        adaptive_long_table=True,
        outlined_table_extraction=True,
        merge_tables_across_pages_in_markdown=True,
        output_pdf_of_document=False,
        fast_mode=False,
        skip_diagonal_text=False,
        preserve_layout_alignment_across_pages=False,
        preserve_very_small_text=False,
        do_not_unroll_columns=False,
        extract_layout=False,
        html_make_all_elements_visible=False,
        html_remove_navigation_elements=False,
        html_remove_fixed_elements=False,
        spreadsheet_extract_sub_tables=True,
        save_images=True,
        parse_mode="parse_page_with_agent",
        page_separator="\n\n---\n\n",
        cleaning_pass="playground_default",
        system_prompt_append=(
            """ Extract the PDF to Markdown. Important extraction rules:
Reconstruct two-column layouts into a single continuous reading order (left column then right).

Do not convert page running headers and footers into document headings, insteaf delete them. If a short phrase (like a single word or a short phrase) repeats across multiple pages, treat it as a running header/footer and exclude it from the Markdown output.

Remove obvious footer text such as page numbers, "Downloaded from…", "See the Terms and Conditions…", journal name footers, copyright lines, and DOI repeated on each page.

Preserve section headings, bold/italic formatting, lists, tables, images and inline links. Only remove repeated lines that appear on many pages.

Keep tables as Markdown tables. Keep images as ![](path) with alt text.

Do not duplicate content across pages. Join lines that are broken in the middle of sentences.

If you are unsure whether a repeated short phrase is a genuine heading or a running header, prefer to treat it as a running header and skip it (we will post-process later if needed).

Example to ignore as headers/footers (do not treat as headings):

Downloaded from https://...

8503, 2021, 1, Downloaded from ...

Short repeated words like Complexity (if repeated across pages), journal name, or page numbers.

Output: a single Markdown file in correct reading order, with headers/footers removed.
"""
        ),
    )
    document = parser.load_data(pdf_path)
    markdown_text = "\n\n".join(page.text for page in document)
    return markdown_text


def md_to_structured_json(md_text: str) -> Dict[str, Any]:
    lines = md_text.splitlines()
    root: Dict[str, Any] = {"title": None, "sections": []}
    stack: List[Tuple[int, Dict[str, Any]]] = [(0, root)]
    current_text: List[str] = []

    def flush_text() -> None:
        nonlocal current_text
        if current_text:
            section = stack[-1][1]
            text_block = "\n".join(current_text).strip()
            if text_block:
                if "text" in section:
                    section["text"] += "\n" + text_block
                else:
                    section["text"] = text_block
            current_text = []

    for line in lines:
        heading_match = re.match(r"^(#+)\s+(.*)", line)
        if heading_match:
            flush_text()
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            if level == 1 and root["title"] is None:
                root["title"] = title
                continue
            section: Dict[str, Any] = {"heading": title}
            while stack and stack[-1][0] >= level:
                stack.pop()
            parent = stack[-1][1]
            if "sections" not in parent:
                parent["sections"] = []
            parent["sections"].append(section)
            stack.append((level, section))
        else:
            current_text.append(line)

    flush_text()
    return root


def extract_images_and_metadata(pdf_path: str, json_file_path: str, images_dir: str) -> Dict[str, Any]:
    os.makedirs(images_dir, exist_ok=True)

    with open(json_file_path, "r", encoding="utf-8") as f:
        paper_data = json.load(f)

    doc = fitz.open(pdf_path)
    images_list: List[Dict[str, Any]] = []

    for page_num, page in enumerate(doc):
        image_list = page.get_images()
        for img_num, img in enumerate(image_list, start=1):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            img_path = os.path.join(images_dir, f"page_{page_num + 1}_img_{img_num}.jpg")

            if pix.n > 4:
                pix = fitz.Pixmap(fitz.csRGB, pix)

            pix.save(img_path)
            images_list.append({"page": page_num + 1, "path": img_path})

        if page_num == 0:
            text = page.get_text()
            doi_match = re.search(r"doi:\s*([^\s]+)", text)
            if doi_match:
                paper_data["doi"] = doi_match.group(1)

    paper_data["images"] = images_list

    with open(json_file_path, "w", encoding="utf-8") as f:
        json.dump(paper_data, f, indent=2, ensure_ascii=False)

    return paper_data


def call_openrouter_for_authors(structured_json: Dict[str, Any]) -> List[Dict[str, str]]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    api_url = "https://openrouter.ai/api/v1/chat/completions"

    json_text = json.dumps(structured_json, indent=2, ensure_ascii=False)
    data = {
        "model": "deepseek/deepseek-r1-0528:free",
        "messages": [
            {"role": "system", "content": "You are a data analyst that answers based on provided JSON data."},
            {"role": "user", "content": f"Here is the JSON document:\n{json_text}"},
            {"role": "user", "content": "What are the authors listed in this dataset? Give me only their full name"},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = requests.post(api_url, json=data, headers=headers, timeout=120)
    resp.raise_for_status()
    api_response = resp.json()

    content = None
    try:
        content = api_response["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        content = None

    if not content:
        return []

    names = re.findall(r"\d+\.\s+\*{0,2}(.*?)\*{0,2}", content)
    names = [name.strip() for name in names if name.strip()]
    return [{"name": name} for name in names]


def process_pdf_input(input_source: str, is_url: bool, base_work_dir: Optional[str] = None) -> ProcessingResult:
    ensure_env_vars()
    work_dir = create_work_dir(base_work_dir)

    # Determine PDF path
    if is_url:
        pdf_path = download_pdf_from_url(input_source, work_dir)
    else:
        if not os.path.exists(input_source):
            raise FileNotFoundError(f"File does not exist: {input_source}")
        # Copy into work_dir for a clean run folder
        pdf_basename = os.path.basename(input_source)
        pdf_path = os.path.join(work_dir, pdf_basename)
        shutil.copy2(input_source, pdf_path)

    base_filename = os.path.splitext(os.path.basename(pdf_path))[0]
    markdown_file = os.path.join(work_dir, f"{base_filename}-processed.md")
    json_file = os.path.join(work_dir, f"{base_filename}-converted.json")
    images_dir = os.path.join(work_dir, f"{base_filename}-images")

    # Convert to markdown with LlamaParse
    markdown_text = convert_pdf_to_markdown_with_llama(pdf_path)
    with open(markdown_file, "w", encoding="utf-8") as f_md:
        f_md.write(markdown_text)

    # Markdown -> structured JSON
    structured = md_to_structured_json(markdown_text)
    with open(json_file, "w", encoding="utf-8") as f_json:
        json.dump(structured, f_json, indent=2, ensure_ascii=False)

    # Images + DOI extraction
    paper_data = extract_images_and_metadata(pdf_path, json_file, images_dir)

    # OpenRouter authors enrichment
    authors = call_openrouter_for_authors(paper_data)
    paper_data["authors"] = authors
    with open(json_file, "w", encoding="utf-8") as f_json:
        json.dump(paper_data, f_json, indent=2, ensure_ascii=False)

    return ProcessingResult(
        pdf_path=pdf_path,
        markdown_file=markdown_file,
        json_file=json_file,
        images_dir=images_dir,
        authors=authors,
        doi=paper_data.get("doi"),
    )


# ---------- FastAPI setup ----------
app = FastAPI(title="PDF Processor Service", version="1.0.0")

# Enable CORS for local development and integration with the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProcessResponse(BaseModel):
    run_dir: str
    pdf_path: str
    markdown_file: str
    json_file: str
    images_dir: str
    authors: List[Dict[str, str]]
    doi: Optional[str] = None
    paper_data: Dict[str, Any]
    markdown_preview: Optional[str] = None


@app.post("/process", response_model=ProcessResponse)
async def process_endpoint(
    pdf_url: Optional[str] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
):
    try:
        ensure_env_vars()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not pdf_url and not file:
        raise HTTPException(status_code=422, detail="Provide either 'file' upload or 'pdf_url'.")

    work_dir = create_work_dir()

    try:
        if file is not None:
            # Save uploaded file
            dest_pdf_path = os.path.join(work_dir, file.filename or "uploaded.pdf")
            with open(dest_pdf_path, "wb") as out:
                shutil.copyfileobj(file.file, out)
            result = process_pdf_input(dest_pdf_path, is_url=False, base_work_dir=os.path.dirname(work_dir))
        else:
            result = process_pdf_input(pdf_url, is_url=True, base_work_dir=os.path.dirname(work_dir))
    except Exception as e:
        # Clean up the run directory on failure
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))

    # Work dir is the parent of generated files
    # Load paper_data JSON and prepare a markdown preview for convenience in clients
    try:
        with open(result.json_file, "r", encoding="utf-8") as f_json:
            paper_data: Dict[str, Any] = json.load(f_json)
    except Exception:
        paper_data = {}

    markdown_preview: Optional[str] = None
    try:
        with open(result.markdown_file, "r", encoding="utf-8") as f_md:
            text = f_md.read()
            markdown_preview = text[:20000]
    except Exception:
        markdown_preview = None

    return JSONResponse(
        content=ProcessResponse(
            run_dir=os.path.dirname(result.markdown_file),
            pdf_path=result.pdf_path,
            markdown_file=result.markdown_file,
            json_file=result.json_file,
            images_dir=result.images_dir,
            authors=result.authors,
            doi=result.doi,
            paper_data=paper_data,
            markdown_preview=markdown_preview,
        ).dict()
    )


# ---------- CLI entry ----------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process a PDF via LlamaParse and enrich with authors via OpenRouter.")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", dest="pdf_url", help="URL to the PDF file")
    src.add_argument("--path", dest="pdf_path", help="Local path to the PDF file")
    parser.add_argument("--work-dir", dest="work_dir", default=None, help="Base directory for run outputs (default: ./runs)")
    parser.add_argument("--print-json", action="store_true", help="Print final JSON to stdout")
    parser.add_argument("--serve", action="store_true", help="Start API server instead of processing once")
    parser.add_argument("--host", default="0.0.0.0", help="Host for API server")
    parser.add_argument("--port", type=int, default=8000, help="Port for API server")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.serve:
        # Start API server
        uvicorn.run("pdf_processor_service:app", host=args.host, port=args.port, reload=False)
        return

    try:
        ensure_env_vars()
    except RuntimeError as e:
        print(f"Environment error: {e}")
        raise SystemExit(1)

    is_url = args.pdf_url is not None
    source = args.pdf_url if is_url else args.pdf_path

    try:
        result = process_pdf_input(source, is_url=is_url, base_work_dir=args.work_dir)
    except Exception as e:
        print(f"Processing failed: {e}")
        raise SystemExit(2)

    print("Processing completed.")
    print(f"PDF: {result.pdf_path}")
    print(f"Markdown: {result.markdown_file}")
    print(f"JSON: {result.json_file}")
    print(f"Images: {result.images_dir}")
    if result.doi:
        print(f"DOI: {result.doi}")
    if result.authors:
        print("Authors:")
        for author in result.authors:
            print(f"- {author.get('name', '')}")

    if args.print_json:
        with open(result.json_file, "r", encoding="utf-8") as f:
            print(f.read())


if __name__ == "__main__":
    main()


