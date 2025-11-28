import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Home, ExternalLink } from 'lucide-react';

interface Summary {
  id: string;
  video_url: string;
  video_title: string | null;
  summary: string;
  created_at: string;
}

const Share = () => {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      if (!id) {
        setError('Invalid share link');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('summaries')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        if (!data) {
          setError('Summary not found');
        } else {
          setSummary(data);
        }
      } catch (err) {
        console.error('Error loading summary:', err);
        setError('Failed to load summary');
      } finally {
        setIsLoading(false);
      }
    };

    loadSummary();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {error || 'Summary not found'}
          </h1>
          <p className="text-muted-foreground mb-6">
            This summary link may be invalid or the summary may have been removed.
          </p>
          <Link to="/">
            <Button>
              <Home className="mr-2 h-4 w-4" />
              Go to Home
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/">
            <Button variant="outline" size="sm">
              <Home className="mr-2 h-4 w-4" />
              Home
            </Button>
          </Link>
        </div>

        <Card className="p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {summary.video_title || 'Video Summary'}
            </h1>
            <a
              href={summary.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Watch Video
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="prose prose-sm max-w-none text-foreground">
            <div className="whitespace-pre-wrap">{summary.summary}</div>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Shared on {new Date(summary.created_at).toLocaleDateString()}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Share;
