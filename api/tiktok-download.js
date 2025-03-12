// File: api/tiktok-download.js
import axios from 'axios';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query.url;

  // Validate URL
  if (!url || !url.includes('tiktok.com')) {
    return res.status(400).json({ error: 'Invalid or missing TikTok URL' });
  }

  try {
    // Fetch TikTok page content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    // Extract video data using a method similar to VT downloader
    const $ = cheerio.load(response.data);
    
    // Look for the video metadata in the HTML
    const scripts = $('script').filter(function() {
      return $(this).html().includes('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    });
    
    let videoData = null;
    
    if (scripts.length > 0) {
      const scriptContent = scripts.first().html();
      const jsonStart = scriptContent.indexOf('{');
      const jsonEnd = scriptContent.lastIndexOf('}') + 1;
      const jsonStr = scriptContent.substring(jsonStart, jsonEnd);
      
      try {
        const parsed = JSON.parse(jsonStr);
        const routes = parsed?.__UNIVERSAL_DATA_FOR_REHYDRATION__?.['routes'];
        
        if (routes) {
          const routeKeys = Object.keys(routes);
          for (const key of routeKeys) {
            const videoInfo = routes[key]?.['videoData'] || routes[key]?.['itemInfo']?.['itemStruct'];
            if (videoInfo) {
              videoData = {
                id: videoInfo.id || '',
                desc: videoInfo.desc || '',
                createTime: videoInfo.createTime || '',
                video: {
                  playAddr: videoInfo.video?.playAddr || '',
                  downloadAddr: videoInfo.video?.downloadAddr || '',
                  cover: videoInfo.video?.cover || '',
                  duration: videoInfo.video?.duration || 0,
                }
              };
              break;
            }
          }
        }
      } catch (e) {
        console.error('Error parsing JSON:', e);
      }
    }
    
    if (!videoData) {
      // Fallback method using regular expressions to extract video URL
      const videoUrlMatch = response.data.match(/"playAddr":"([^"]+)"/);
      const coverUrlMatch = response.data.match(/"cover":"([^"]+)"/);
      const descMatch = response.data.match(/"desc":"([^"]+)"/);
      
      if (videoUrlMatch) {
        videoData = {
          id: '',
          desc: descMatch ? descMatch[1].replace(/\\u[0-9a-fA-F]{4}/g, match => 
            String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))
          ) : '',
          createTime: '',
          video: {
            playAddr: videoUrlMatch[1].replace(/\\u0026/g, '&'),
            downloadAddr: videoUrlMatch[1].replace(/\\u0026/g, '&'),
            cover: coverUrlMatch ? coverUrlMatch[1].replace(/\\u0026/g, '&') : '',
            duration: 0,
          }
        };
      }
    }
    
    if (!videoData) {
      return res.status(404).json({ error: 'Video information not found' });
    }
    
    // Get the actual video using the extracted URL
    const videoResponse = await axios.get(videoData.video.playAddr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
      },
      responseType: 'arraybuffer'
    });
    
    // Return video information and download URLs
    return res.status(200).json({
      success: true,
      message: 'Video found successfully',
      data: {
        id: videoData.id,
        description: videoData.desc,
        created_at: videoData.createTime,
        video_url: videoData.video.playAddr,
        download_url: videoData.video.downloadAddr,
        cover_url: videoData.video.cover,
        duration: videoData.video.duration,
        content_type: videoResponse.headers['content-type'],
        file_size: videoResponse.data.length,
      }
    });
    
  } catch (error) {
    console.error('Error fetching TikTok video:', error);
    return res.status(500).json({ 
      error: 'Failed to download video', 
      message: error.message 
    });
  }
}
