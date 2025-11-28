import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Play, History, Sparkles, Share2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Summary {
  id: string;
  video_url: string;
  video_title: string | null;
  summary: string;
  created_at: string;
}

const Index = () => {
  const [videoUrl, setVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<Summary[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Error loading history:", error);
    } else {
      setHistory(data || []);
    }
  };

  const handleSummarize = async () => {
    if (!videoUrl.trim()) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    setIsLoading(true);
    setCurrentSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke("summarize-video", {
        body: { videoUrl },
      });

      if (error) throw error;

      setCurrentSummary({
        id: data.id,
        video_url: videoUrl,
        video_title: data.videoTitle,
        summary: data.summary,
        created_at: data.created_at,
      });

      toast.success("Video summarized successfully!");
      loadHistory();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to summarize video");
    } finally {
      setIsLoading(false);
    }
  };

  const handleHistoryClick = (summary: Summary) => {
    setCurrentSummary(summary);
    setVideoUrl(summary.video_url);
  };

  const handleShare = async (id: string) => {
    const shareUrl = `${window.location.origin}/share/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(id);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error("Failed to copy link. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            <span>Powered by DeepSeek AI</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Video Knowledge Retriever
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transform any YouTube video into a comprehensive summary. Perfect for students, researchers, and curious minds.
          </p>
        </div>

        {/* Input Section */}
        <Card className="p-8 mb-8 shadow-lg border-primary/20 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Paste YouTube URL here... (e.g., https://youtube.com/watch?v=...)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && !isLoading && handleSummarize()}
                className="h-14 text-lg border-2 focus:border-primary transition-colors"
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleSummarize}
              disabled={isLoading || !videoUrl.trim()}
              size="lg"
              className="h-14 px-8 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white font-semibold shadow-md hover:shadow-lg transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  Summarize Video
                </>
              )}
            </Button>
          </div>

          {isLoading && (
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-3 text-muted-foreground animate-pulse-soft">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <span>Fetching transcript and generating summary...</span>
                <div className="w-2 h-2 bg-primary rounded-full"></div>
              </div>
            </div>
          )}
        </Card>

        {/* Summary Display */}
        {currentSummary && (
          <Card className="p-8 mb-8 shadow-lg animate-fade-in border-l-4 border-l-primary">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-primary mb-2">
                  {currentSummary.video_title || "Video Summary"}
                </h2>
                <a
                  href={currentSummary.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {currentSummary.video_url}
                </a>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleShare(currentSummary.id)}
              >
                {copiedId === currentSummary.id ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                {copiedId === currentSummary.id ? 'Copied!' : 'Share'}
              </Button>
            </div>
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-foreground leading-relaxed">
                {currentSummary.summary}
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Generated on {new Date(currentSummary.created_at).toLocaleString()}
              </p>
            </div>
          </Card>
        )}

        {/* History Section */}
        {history.length > 0 && (
          <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-bold">Recent Summaries</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {history.map((summary, index) => (
                <Card
                  key={summary.id}
                  className="p-6 hover:shadow-lg hover:border-primary/40 transition-all"
                  style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => handleHistoryClick(summary)}
                  >
                    <h3 className="font-semibold text-sm mb-2 line-clamp-2 text-foreground">
                      {summary.video_title || "Untitled Video"}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
                      {summary.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(summary.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(summary.id);
                      }}
                      className="w-full"
                    >
                      {copiedId === summary.id ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!currentSummary && !isLoading && history.length === 0 && (
          <div className="text-center py-16 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No summaries yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Paste a YouTube URL above to get started. We'll fetch the transcript and create a comprehensive summary for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
