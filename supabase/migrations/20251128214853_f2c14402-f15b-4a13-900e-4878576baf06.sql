-- Create summaries table for storing video summaries
CREATE TABLE public.summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,
  video_title TEXT,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to read summaries (public app)
CREATE POLICY "Anyone can view summaries"
  ON public.summaries
  FOR SELECT
  USING (true);

-- Create policy to allow anyone to insert summaries (public app)
CREATE POLICY "Anyone can create summaries"
  ON public.summaries
  FOR INSERT
  WITH CHECK (true);

-- Create index on created_at for faster sorting
CREATE INDEX idx_summaries_created_at ON public.summaries(created_at DESC);