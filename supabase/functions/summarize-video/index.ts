import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoUrl } = await req.json();
    
    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'Video URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing video:', videoUrl);

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracted video ID:', videoId);

    // Fetch transcript using YouTube Transcript API
    const transcript = await fetchTranscript(videoId);
    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'Could not fetch transcript. Video may not have captions available.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Transcript fetched, length:', transcript.length);

    // Get video title
    const videoTitle = await fetchVideoTitle(videoId);
    console.log('Video title:', videoTitle);

    // Summarize using DeepSeek API
    const summary = await summarizeWithDeepSeek(transcript, videoTitle);
    console.log('Summary generated, length:', summary.length);

    // Save to database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('summaries')
      .insert({
        video_url: videoUrl,
        video_title: videoTitle,
        summary: summary,
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log('Summary saved to database');

    return new Response(
      JSON.stringify({ 
        summary,
        videoTitle,
        id: data.id,
        created_at: data.created_at
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in summarize-video function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process video';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Use a public API to fetch YouTube transcripts
    const response = await fetch(
      `https://youtube-transcriptor.vercel.app/api/transcript?videoId=${videoId}`
    );
    
    if (!response.ok) {
      console.error('Transcript API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || !data.transcript || data.transcript.length === 0) {
      console.error('No transcript data available');
      return null;
    }
    
    // Combine all transcript segments
    const fullTranscript = data.transcript
      .map((item: any) => item.text)
      .join(' ');
    
    return fullTranscript;
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return null;
  }
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const response = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.title || 'Unknown Video';
    }
  } catch (error) {
    console.error('Error fetching video title:', error);
  }
  
  return 'Unknown Video';
}

async function summarizeWithDeepSeek(transcript: string, title: string): Promise<string> {
  const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
  
  if (!deepseekApiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${deepseekApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates clear, concise summaries of video content. Provide well-structured summaries with key points and main ideas.'
        },
        {
          role: 'user',
          content: `Please summarize the following video transcript. 

Video Title: ${title}

Transcript: ${transcript}

Provide a comprehensive summary that includes:
1. Main topic and purpose
2. Key points discussed
3. Important takeaways
4. Any actionable insights

Keep the summary clear and well-organized.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('DeepSeek API error:', response.status, errorText);
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}