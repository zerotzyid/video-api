# Video Proxy API

Node.js API untuk proxy streaming video dengan dukungan Range Requests dan CORS.

## Endpoints

- `GET /` - Info API
- `GET /health` - Health check
- `GET /metadata` - Metadata video dari upstream
- `GET /video` - Stream video (mendukung `?url=` untuk custom upstream)
- `HEAD /video` - Head request untuk metadata video
- `GET /blogger/resolve?url=<blogger-post-url>` - Resolve URL video dari postingan Blogger

## Usage

### Local

```bash
npm install
npm start
```

Server berjalan di `http://localhost:3003`

### Environment Variables

- `PORT` - Port server (default: 3003)
- `UPSTREAM_URL` - Default URL video upstream
- `FALLBACK_URLS` - Daftar URL fallback yang dicoba jika `UPSTREAM_URL` diblokir/gagal, pisah dengan koma
- `CORS_ORIGIN` - CORS origin (default: *)

### Vercel

1. Push project ke GitHub
2. Import di Vercel
3. Set environment variables:
   - `UPSTREAM_URL` - URL utama
   - `FALLBACK_URLS` - URL alternatif jika utama diblokir
4. Deploy

URL setelah deploy: `https://your-project.vercel.app/video?url=https://cdn.odcloud.net/anime/Otakudesu.io_Clvts.S2--12_End_720p.mp4`

### Contoh Fallback

```bash
FALLBACK_URLS="https://cdn1.example.com/video.mp4,https://cdn2.example.com/video.mp4"
```

## Test

Buka `http://localhost:3003/test.html` untuk halaman test player.
