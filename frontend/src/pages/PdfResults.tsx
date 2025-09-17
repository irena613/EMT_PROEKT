import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileText, Image as ImageIcon, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation, useNavigate } from "react-router-dom";

// This page renders only real backend results

type ProcessResponse = {
  id?: number | null;
  run_dir: string;
  pdf_path: string;
  markdown_file: string;
  json_file: string;
  images_dir: string;
  authors: { name: string }[];
  doi?: string | null;
  paper_data?: any;
  markdown_preview?: string | null;
  pdf_url?: string;
  markdown_url?: string;
  json_url?: string;
};

const PdfResults = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const result = (location.state as any)?.result as ProcessResponse | undefined;

  const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const derivedTitle = useMemo(() => {
    if (!result) return "Processed PDF";
    return result.pdf_path?.split(/[\\/]/).pop() || "Processed PDF";
  }, [result]);
  const [activeTab, setActiveTab] = useState<"text" | "images" | "data">("text");
  const [fullText, setFullText] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState<boolean>(false);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-lg">No results loaded.</p>
          <Button onClick={() => navigate("/")}>Back to Upload</Button>
        </div>
      </div>
    );
  }

  const images: Array<{ page?: number; path?: string; url?: string }> = result.paper_data?.images || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              PDF Extraction Results
            </h1>
            <p className="text-muted-foreground mt-1">
              Extracted content from {derivedTitle}
            </p>
          </div>
          {result.json_url && (
            <a href={`${apiBaseUrl}${result.json_url}`} target="_blank" rel="noreferrer">
              <Button className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export JSON
              </Button>
            </a>
          )}
        </div>


        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: "text", label: "Extracted Text", icon: FileText },
            { id: "images", label: "Images", icon: Hash },
            { id: "data", label: "Structured Data", icon: Hash }
          ].map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={activeTab === (id as any) ? "default" : "outline"}
              onClick={() => setActiveTab(id as any)}
              className="flex items-center gap-2"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        {/* Content Sections */}

        {activeTab === "text" && (
          <Card>
            <CardHeader>
              <CardTitle>Extracted Text Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                {result.markdown_url && !fullText && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!result.markdown_url) return;
                      setLoadingFull(true);
                      try {
                        const resp = await fetch(`${apiBaseUrl}${result.markdown_url}`);
                        const txt = await resp.text();
                        setFullText(txt);
                      } catch (e) {
                        // no-op
                      } finally {
                        setLoadingFull(false);
                      }
                    }}
                    disabled={loadingFull}
                  >
                    {loadingFull ? "Loading..." : "Load full text"}
                  </Button>
                )}
                {fullText && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFullText(null)}
                  >
                    Show preview
                  </Button>
                )}
              </div>
              <div className="h-[70vh] w-full rounded-md border p-4 overflow-auto">
                <div className="whitespace-pre-wrap font-mono text-sm">
                  {(fullText ?? result.markdown_preview) || "No text available."}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "images" && (
          <div className="grid gap-6 md:grid-cols-2">
            {images.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No images detected.
                </CardContent>
              </Card>
            )}
            {images.map((img, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle className="text-lg">Page {img.page ?? "?"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video bg-muted rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                    {img.url ? (
                      <img
                        src={`${apiBaseUrl}${img.url}`}
                        alt={`page-${img.page || idx + 1}`}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "data" && result.paper_data && (
          <Card>
            <CardHeader>
              <CardTitle>Structured Data (from backend)</CardTitle>
              <p className="text-muted-foreground">Parsed document structure and metadata</p>
            </CardHeader>
            <CardContent>
              <div className="h-[70vh] w-full rounded-md border p-4 overflow-auto">
                <pre className="text-sm whitespace-pre">
{JSON.stringify(result.paper_data, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PdfResults;