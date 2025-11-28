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

    // Fetch transcript if available
    const transcript = await fetchTranscript(videoId);

    // Get video title (works even if transcript is missing)
    const videoTitle = await fetchVideoTitle(videoId);
    console.log('Video title:', videoTitle);

    let summary: string;

    if (!transcript) {
      console.log('No transcript available, using fallback instructions for DeepSeek');
      const fallbackTranscript = `TRANSCRIPT NOT AVAILABLE.

The captions for this YouTube video could not be fetched. You do NOT know the exact content of the video.

Based ONLY on the title and URL, do the following:
1. Clearly tell the user that the transcript is not available.
2. Explain what this likely means (no subtitles or restricted video).
3. If the title suggests a topic, give a very high-level, generic description of what such a video might cover.
4. Warn the user that this is just a guess.

Video URL: ${videoUrl}`;
      summary = await summarizeWithAI(fallbackTranscript, videoTitle);
    } else {
      console.log('Transcript fetched, length:', transcript.length);

      // Summarize using DeepSeek API
      summary = await summarizeWithAI(transcript, videoTitle);
      console.log('Summary generated, length:', summary.length);
    }

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
    // Fetch the YouTube video page to extract caption data
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    
    if (!pageResponse.ok) {
      console.error('Failed to fetch YouTube page:', pageResponse.status);
      return null;
    }
    
    const pageHtml = await pageResponse.text();
    
    // Extract the player response JSON from the page
    const playerResponseMatch = pageHtml.match(/"captions":(\{[^}]+captionTracks[^}]+\})/);
    
    if (!playerResponseMatch) {
      console.error('No captions found in video page');
      return null;
    }
    
    // Parse the captions object
    let captionsData;
    try {
      // Find the full captions object
      const fullCaptionsMatch = pageHtml.match(/"captions":(\{"playerCaptionsTracklistRenderer":\{[^}]+?"captionTracks":\[[^\]]+\][^}]*\}\})/);
      if (!fullCaptionsMatch) {
        console.error('Could not parse captions structure');
        return null;
      }
      
      captionsData = JSON.parse(`{${fullCaptionsMatch[1]}}`);
    } catch (e) {
      console.error('Error parsing captions JSON:', e);
      return null;
    }
    
    const captionTracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      console.error('No caption tracks available');
      return null;
    }
    
    // Get the first available caption track (usually English or auto-generated)
    const captionUrl = captionTracks[0].baseUrl;
    console.log('Fetching captions from:', captionUrl);
    
    // Fetch the actual transcript
    const transcriptResponse = await fetch(captionUrl);
    
    if (!transcriptResponse.ok) {
      console.error('Failed to fetch transcript:', transcriptResponse.status);
      return null;
    }
    
    const transcriptData = await transcriptResponse.json();
    
    // Extract text from the transcript events
    if (!transcriptData.events || transcriptData.events.length === 0) {
      console.error('No transcript events found');
      return null;
    }
    
    const fullTranscript = transcriptData.events
      .filter((event: any) => event.segs) // Filter events with segments
      .map((event: any) => 
        event.segs.map((seg: any) => seg.utf8).join('')
      )
      .join(' ')
      .replace(/\n/g, ' ')
      .trim();
    
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

async function summarizeWithAI(transcript: string, title: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
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
    console.error('AI Gateway error:', response.status, errorText);
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}