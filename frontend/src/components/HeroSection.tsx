import { Button } from "@/components/ui/button";
import { useCallback } from "react";

export const HeroSection = () => {
  const onGetStarted = useCallback(() => {
    const el = document.getElementById("pdf-uploader");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-hero overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-primary-glow/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
      <div className="relative z-10 container mx-auto px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent leading-tight">
            Transform Your PDFs
            <span className="block bg-clip-text text-transparent" style={{ color: "#ffffff" }}>
              Instantly
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-foreground/70 mb-12 max-w-2xl mx-auto leading-relaxed">
            Upload your PDF files or paste a link to unlock powerful document processing. 
            Fast, secure, and incredibly easy to use.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              variant="hero" 
              size="lg"
              onClick={onGetStarted}
              className="px-8 py-6 text-lg font-semibold shadow-glow hover:shadow-elegant transition-all duration-300 hover:scale-105"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};