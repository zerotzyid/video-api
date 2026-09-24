export const BASE_URL = 'https://otakudesu.blog';

export async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

export function parseAnimeList(html) {
  const animeList = [];
  
  // Parse anime cards from homepage
  const animeRegex = /<li[^>]*>[\s\S]*?<a href="(https?:\/\/otakudesu\.blog\/anime\/[^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/li>/gi;
  let match;
  
  while ((match = animeRegex.exec(html)) !== null) {
    animeList.push({
      url: match[1],
      title: match[2].trim()
    });
  }
  
  // Alternative parsing for different HTML structure
  if (animeList.length === 0) {
    const linkRegex = /<a href="(https?:\/\/otakudesu\.blog\/anime\/[^"]+)"[^>]*title="([^"]*)"[^>]*>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      animeList.push({
        url: match[1],
        title: match[2].trim() || 'Unknown'
      });
    }
  }
  
  return animeList;
}

export function parseAnimeDetail(html) {
  const detail = {
    title: '',
    image: '',
    description: '',
    episodes: [],
    genres: [],
    status: '',
    rating: ''
  };
  
  // Title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                    html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) detail.title = titleMatch[1].replace(/\s*Sub Indo$/i, '').trim();
  
  // Image
  const imgMatch = html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i) ||
                   html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i);
  if (imgMatch) detail.image = imgMatch[1];
  
  // Description
  const descMatch = html.match(/<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    detail.description = descMatch[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Genres
  const genreRegex = /<a href="https?:\/\/otakudesu\.blog\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
  let genreMatch;
  while ((genreMatch = genreRegex.exec(html)) !== null) {
    detail.genres.push(genreMatch[1].trim());
  }
  
  // Status
  const statusMatch = html.match(/Status[^<]*:<\/span>\s*([^<]+)/i) ||
                      html.match(/<span[^>]*>Status:<\/span>\s*([^<]+)/i);
  if (statusMatch) detail.status = statusMatch[1].trim();
  
  // Rating
  const ratingMatch = html.match(/<span[^>]*>Rating:<\/span>\s*([^<]+)/i) ||
                      html.match(/Rating[^<]*:<\/span>\s*([^<]+)/i);
  if (ratingMatch) detail.rating = ratingMatch[1].trim();
  
  // Episodes
  const episodeRegex = /<a href="(https?:\/\/otakudesu\.blog\/episode\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let epMatch;
  while ((epMatch = episodeRegex.exec(html)) !== null) {
    detail.episodes.push({
      url: epMatch[1],
      title: epMatch[2].trim()
    });
  }
  
  // Alternative episode parsing
  if (detail.episodes.length === 0) {
    const altEpRegex = /<li[^>]*>\s*<a href="(https?:\/\/otakudesu\.blog\/[^"]+)"[^>]*>([^<]+)<\/a>\s*<\/li>/gi;
    while ((epMatch = altEpRegex.exec(html)) !== null) {
      if (epMatch[1].includes('episode') || epMatch[1].includes('/')) {
        detail.episodes.push({
          url: epMatch[1],
          title: epMatch[2].trim()
        });
      }
    }
  }
  
  return detail;
}

export function parseStreamUrls(html) {
  const streams = {
    mp4: [],
    hls: [],
    other: [],
    embedHtml: '',
    embeds: []
  };
  
  // Look for video URLs in various formats
  const patterns = [
    /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/gi,
    /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
    /https?:\/\/[^"'\s]+\.webm[^"'\s]*/gi,
    /https?:\/\/[^"'\s]+\.ogg[^"'\s]*/gi,
    /"file"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /"src"\s*:\s*"([^"]+\.mp4[^"]*)"/gi,
    /data-src="([^"]+\.mp4[^"]*)"/gi,
    /data-url="([^"]+\.mp4[^"]*)"/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1] || match[0];
      if (url.includes('.m3u8')) {
        streams.hls.push(url);
      } else if (url.includes('.mp4')) {
        streams.mp4.push(url);
      } else if (url.includes('.webm') || url.includes('.ogg')) {
        streams.other.push(url);
      }
    }
  }
  
  // Extract iframe embeds
  const iframeRegex = /<iframe[^>]+src="([^"]+)"[^>]*>/gi;
  let iframeMatch;
  while ((iframeMatch = iframeRegex.exec(html)) !== null) {
    streams.embeds.push(iframeMatch[1]);
  }
  
  // Extract embed HTML blocks
  const embedBlockRegex = /<div[^>]+class="[^"]*responsive-embed-stream[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let embedMatch;
  while ((embedMatch = embedBlockRegex.exec(html)) !== null) {
    streams.embedHtml += embedMatch[1].trim();
  }
  
  // Extract video URLs from embed pages (desustream, etc.)
  const embedUrlPatterns = [
    /https?:\/\/desustream\.net\/dstream\/odcdn\/\?id=[^"'\s]+/gi,
    /https?:\/\/[^"'\s]*desustream[^"'\s]*/gi
  ];
  
  for (const pattern of embedUrlPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      streams.embeds.push(match[0]);
    }
  }
  
  // Remove duplicates
  streams.mp4 = [...new Set(streams.mp4)];
  streams.hls = [...new Set(streams.hls)];
  streams.other = [...new Set(streams.other)];
  streams.embeds = [...new Set(streams.embeds)];
  
  return streams;
}

export async function getDesustreamVideoUrl(embedUrl) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    
    // Look for direct video URLs in the embed page
    const videoPatterns = [
      /https?:\/\/cdn\.odcloud\.net\/anime\/[^"'\s<>]+/gi,
      /https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi,
      /https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi
    ];
    
    for (const pattern of videoPatterns) {
      const match = pattern.exec(html);
      if (match) {
        let url = match[0];
        // Decode HTML entities
        url = url.replace(/&amp;/g, '&');
        return url;
      }
    }
    
    // Look for video URLs in script tags
    const scriptRegex = /var\s+\w+\s*=\s*['"](https?:\/\/[^'"]+\.mp4[^'"]*)['"]/gi;
    const scriptMatch = scriptRegex.exec(html);
    if (scriptMatch) {
      return scriptMatch[1].replace(/&amp;/g, '&');
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

export async function getOtakudesuEmbed(episodeUrl) {
  const baseUrl = 'https://otakudesu.blog';
  
  // Step 1: Get the episode page to extract data-content attributes
  const episodeRes = await fetch(episodeUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!episodeRes.ok) throw new Error('Failed to fetch episode page');
  const episodeHtml = await episodeRes.text();
  
  // Extract data-content attributes
  const dataContents = episodeHtml.match(/data-content="([^"]+)"/g) || [];
  if (dataContents.length === 0) throw new Error('No data-content attributes found');
  
  // Step 2: Get the nonce
  const nonceRes = await fetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: 'action=aa1208d27f29ca340c92c66d1926f13f'
  });
  
  if (!nonceRes.ok) throw new Error('Failed to get nonce');
  const nonceData = await nonceRes.json();
  const nonce = nonceData.data;
  
  // Step 3: Try each data-content to get embed HTML
  for (const dataContent of dataContents) {
    const match = dataContent.match(/data-content="([^"]+)"/);
    if (!match) continue;
    
    try {
      const decoded = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
      const { id, i, q } = decoded;
      
      const embedRes = await fetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: `action=2a3505c93b0035d3f455df82bf976b84&id=${id}&i=${i}&q=${encodeURIComponent(q)}&nonce=${encodeURIComponent(nonce)}`
      });
      
      if (!embedRes.ok) continue;
      
      const embedData = await embedRes.json();
      if (embedData.data) {
        const embedHtml = Buffer.from(embedData.data, 'base64').toString('utf-8');
        return embedHtml;
      }
    } catch (err) {
      // Try next data-content
      continue;
    }
  }
  
  throw new Error('No valid embed data received');
}

export async function getAnimeList(page = 1) {
  const url = page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`;
  const html = await fetchHtml(url);
  return parseAnimeList(html);
}

export async function getAnimeDetail(animeUrl) {
  const html = await fetchHtml(animeUrl);
  return parseAnimeDetail(html);
}

export async function getStreamUrls(episodeUrl) {
  const html = await fetchHtml(episodeUrl);
  return parseStreamUrls(html);
}

export async function searchAnime(query) {
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  return parseAnimeList(html);
}
