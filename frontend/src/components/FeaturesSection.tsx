import { Card } from "@/components/ui/card";
import { FileText, Zap, Shield, Download } from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Multiple Input Methods",
    description: "Upload files directly or paste URLs to your PDFs. We support both local files and remote documents."
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Process your documents in seconds with our optimized algorithms and powerful infrastructure."
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Your documents are processed securely and deleted after processing. We never store your files."
  },
  {
    icon: Download,
    title: "Easy Export",
    description: "Download your processed results in multiple formats. Get exactly what you need, when you need it."
  }
];

export const FeaturesSection = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Why Choose Our Platform?
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Built for speed, security, and simplicity. Process your PDFs with confidence 
            using our professional-grade tools.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="p-8 text-center shadow-card hover:shadow-glow transition-all duration-300 hover:scale-105 group"
            >
              <div className="mx-auto w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mb-6 shadow-elegant group-hover:shadow-glow transition-all duration-300">
                <feature.icon className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-foreground">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};