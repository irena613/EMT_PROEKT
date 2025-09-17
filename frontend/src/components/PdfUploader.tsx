import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Upload, Link2, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const PdfUploader = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  type ProcessResponse = {
    run_dir: string;
    pdf_path: string;
    markdown_file: string;
    json_file: string;
    images_dir: string;
    authors: { name: string }[];
    doi?: string | null;
  };

  const apiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:8000";

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type === "application/pdf") {
      setUploadedFile(file);
      toast({
        title: "PDF uploaded successfully!",
        description: `${file.name} is ready to process.`,
      });
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfUrl.trim()) return;
    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append("pdf_url", pdfUrl.trim());
      const resp = await fetch(`${apiBaseUrl}/process`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.detail || `Request failed with ${resp.status}`);
      }
      const data: ProcessResponse = await resp.json();
      navigate("/results", { state: { result: data } });
    } catch (error: any) {
      toast({
        title: "Failed to process URL",
        description: error?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
  };

  const handleFileProcess = async () => {
    if (!uploadedFile) return;
    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append("file", uploadedFile);
      const resp = await fetch(`${apiBaseUrl}/process`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.detail || `Request failed with ${resp.status}`);
      }
      const data: ProcessResponse = await resp.json();
      navigate("/results", { state: { result: data } });
    } catch (error: any) {
      toast({
        title: "Failed to process PDF",
        description: error?.message || "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section id="pdf-uploader" className="py-20 bg-gradient-subtle">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Choose Your Method
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload a PDF file directly or provide a link to your document. 
            We support multiple input methods for your convenience.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Tab Navigation */}
          <div className="flex mb-8 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-3 px-6 rounded-md font-medium transition-all duration-200 ${
                activeTab === "upload"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="w-5 h-5 inline mr-2" />
              Upload File
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={`flex-1 py-3 px-6 rounded-md font-medium transition-all duration-200 ${
                activeTab === "url"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link2 className="w-5 h-5 inline mr-2" />
              Paste URL
            </button>
          </div>

          {/* Upload Section */}
          {activeTab === "upload" && (
            <Card className="p-8 border-2 border-dashed border-border hover:border-primary/50 transition-all duration-300 shadow-card">
              {!uploadedFile ? (
                <div
                  {...getRootProps()}
                  className={`cursor-pointer text-center py-12 transition-all duration-300 ${
                    isDragActive ? "scale-105 bg-accent/50" : ""
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="mx-auto w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center mb-6 shadow-glow">
                    <Upload className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">
                    Drop your PDF here
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    or click to browse your files
                  </p>
                  <Button variant="outline" size="lg">
                    Choose File
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="mx-auto w-16 h-16 bg-accent rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-accent-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">
                    {uploadedFile.name}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Button variant="hero" size="lg" onClick={handleFileProcess} disabled={isProcessing}>
                      Process PDF
                    </Button>
                    <Button variant="outline" size="lg" onClick={removeFile}>
                      <X className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                  
                </div>
              )}
            </Card>
          )}

          {/* URL Section */}
          {activeTab === "url" && (
            <Card className="p-8 shadow-card">
              <form onSubmit={handleUrlSubmit} className="space-y-6">
                <div className="text-center mb-8">
                  <div className="mx-auto w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center mb-6 shadow-glow">
                    <Link2 className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-4 text-foreground">
                    Paste PDF URL
                  </h3>
                  <p className="text-muted-foreground">
                    Enter the URL of your PDF document
                  </p>
                </div>
                
                <div className="space-y-4">
                  <Input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={pdfUrl}
                    onChange={(e) => setPdfUrl(e.target.value)}
                    className="text-lg py-6 border-2 focus:border-primary/50 transition-all duration-200"
                  />
                  <Button 
                    type="submit" 
                    variant="hero" 
                    size="lg" 
                    className="w-full"
                    disabled={!pdfUrl.trim() || isProcessing}
                  >
                    Process PDF from URL
                  </Button>
                  
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};