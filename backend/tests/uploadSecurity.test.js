import fs from 'fs';
import path from 'path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { connectPostgres, disconnectPostgres, runPostgresMigrations } from '../src/config/pg.js';
import {
  MAX_FILE_SIZE_BYTES,
  UPLOADS_ROOT,
  detectImageSignature,
  persistUploadedImage,
} from '../src/middleware/upload.js';

let server;
let baseUrl;
let originUrl;
let riderToken = '';
const createdFiles = [];

const VALID_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const VALID_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
  Buffer.from([0xff, 0xd9]),
]);
const VALID_WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
  Buffer.from([0x0e, 0x00, 0x00, 0x00]),
]);

before(async () => {
  await connectPostgres({ usePglite: true });
  await runPostgresMigrations();

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      originUrl = `http://127.0.0.1:${port}`;
      baseUrl = `${originUrl}/api`;
      resolve();
    });
  });

  const regRes = await fetch(`${baseUrl}/auth/register/rider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Upload Security Tester',
      email: 'upload.tester@kaafila.test',
      password: 'UploadTester123!',
      city: 'Manali',
    }),
  });
  assert.equal(regRes.status, 201);
  riderToken = (await regRes.json()).data.token;
});

after(async () => {
  for (const filename of createdFiles) {
    const filePath = path.join(UPLOADS_ROOT, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectPostgres();
});

describe('KAAFILA Phase 5.1 Stage 3A — Upload Validation & Rate Limiting', () => {
  it('validates magic-byte signatures for JPEG, PNG, WebP and rejects invalid/empty buffers', () => {
    assert.deepEqual(detectImageSignature(VALID_JPEG), { mimetype: 'image/jpeg', ext: '.jpg' });
    assert.deepEqual(detectImageSignature(VALID_PNG), { mimetype: 'image/png', ext: '.png' });
    assert.deepEqual(detectImageSignature(VALID_WEBP), { mimetype: 'image/webp', ext: '.webp' });
    assert.equal(detectImageSignature(Buffer.alloc(0)), null);
    assert.equal(detectImageSignature(Buffer.from('<html><script>alert(1)</script></html>')), null);
    assert.equal(detectImageSignature(null), null);
  });

  it('requires authentication and rejects spoofed MIME types, empty files, and oversized files without writing to disk', async () => {
    const unauthRes = await fetch(`${baseUrl}/uploads/image`, { method: 'POST' });
    assert.equal(unauthRes.status, 401);

    const beforeFiles = new Set(fs.existsSync(UPLOADS_ROOT) ? fs.readdirSync(UPLOADS_ROOT) : []);

    // Spoofed image/png MIME with HTML payload
    const spoofForm = new FormData();
    spoofForm.append(
      'image',
      new Blob([Buffer.from('<html><body>not a png</body></html>')], { type: 'image/png' }),
      'evil.png'
    );
    const spoofRes = await fetch(`${baseUrl}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: spoofForm,
    });
    assert.equal(spoofRes.status, 400);

    // Empty file with image/jpeg MIME
    const emptyForm = new FormData();
    emptyForm.append('image', new Blob([Buffer.alloc(0)], { type: 'image/jpeg' }), 'empty.jpg');
    const emptyRes = await fetch(`${baseUrl}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: emptyForm,
    });
    assert.equal(emptyRes.status, 400);

    // Oversized (> 2 MB) file
    const oversized = Buffer.concat([VALID_PNG, Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024)]);
    const largeForm = new FormData();
    largeForm.append('image', new Blob([oversized], { type: 'image/png' }), 'huge.png');
    const largeRes = await fetch(`${baseUrl}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: largeForm,
    });
    assert.equal(largeRes.status, 400);

    const afterFiles = fs.existsSync(UPLOADS_ROOT) ? fs.readdirSync(UPLOADS_ROOT) : [];
    const leakedFiles = afterFiles.filter((f) => !beforeFiles.has(f));
    assert.deepEqual(leakedFiles, []);
  });

  it('accepts valid JPEG, PNG, and WebP uploads, derives canonical extension/MIME from signature, and hardens /uploads', async () => {
    const cases = [
      { bytes: VALID_JPEG, sentMime: 'image/jpeg', sentName: 'photo.jpeg', expectedExt: '.jpg', expectedMime: 'image/jpeg' },
      { bytes: VALID_PNG, sentMime: 'image/jpeg', sentName: 'misnamed.jpg', expectedExt: '.png', expectedMime: 'image/png' },
      { bytes: VALID_WEBP, sentMime: 'image/webp', sentName: 'banner.webp', expectedExt: '.webp', expectedMime: 'image/webp' },
    ];

    for (const c of cases) {
      const form = new FormData();
      form.append('image', new Blob([c.bytes], { type: c.sentMime }), c.sentName);
      const res = await fetch(`${baseUrl}/uploads/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${riderToken}` },
        body: form,
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.storageProvider, 'local');
      assert.equal(body.data.mimetype, c.expectedMime);
      assert.ok(body.data.filename.endsWith(c.expectedExt));
      assert.equal(body.data.url, `/uploads/${body.data.filename}`);
      createdFiles.push(body.data.filename);

      const staticRes = await fetch(`${originUrl}${body.data.url}`);
      assert.equal(staticRes.status, 200);
    }

    // Dotfiles must be denied on /uploads
    const dotfilePath = path.join(UPLOADS_ROOT, '.test-hidden');
    fs.writeFileSync(dotfilePath, 'secret');
    try {
      const dotRes = await fetch(`${originUrl}/uploads/.test-hidden`);
      assert.equal(dotRes.status, 404);
    } finally {
      if (fs.existsSync(dotfilePath)) fs.unlinkSync(dotfilePath);
    }
  });

  it('supports mocked Supabase Storage uploads and handles upstream failures safely', async () => {
    const uploadedCalls = [];
    const mockSuccessClient = {
      storage: {
        from(bucket) {
          return {
            async upload(objectPath, buffer, opts) {
              uploadedCalls.push({ bucket, objectPath, length: buffer.length, opts });
              return { error: null };
            },
            getPublicUrl(objectPath) {
              return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/kaafila-images/${objectPath}` } };
            },
          };
        },
      },
    };

    const result = await persistUploadedImage(
      { buffer: VALID_WEBP, mimetype: 'image/png', size: VALID_WEBP.length },
      'user-123',
      { supabaseClient: mockSuccessClient }
    );
    assert.equal(result.storageProvider, 'supabase');
    assert.equal(result.mimetype, 'image/webp');
    assert.ok(result.filename.startsWith('user-123/') && result.filename.endsWith('.webp'));
    assert.equal(uploadedCalls.length, 1);
    assert.equal(uploadedCalls[0].opts.upsert, false);
    assert.equal(uploadedCalls[0].opts.contentType, 'image/webp');

    const mockFailClient = {
      storage: {
        from() {
          return {
            async upload() {
              return { error: { message: 'Storage unavailable' } };
            },
          };
        },
      },
    };
    await assert.rejects(
      () => persistUploadedImage({ buffer: VALID_PNG }, 'user-123', { supabaseClient: mockFailClient }),
      (err) => err.statusCode === 502
    );
  });

  it('enforces upload rate limiting (20 uploads per 15 minutes)', async () => {
    let hit429 = false;
    for (let i = 0; i < 20; i += 1) {
      const form = new FormData();
      form.append('image', new Blob([VALID_PNG], { type: 'image/png' }), `rate-${i}.png`);
      const res = await fetch(`${baseUrl}/uploads/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${riderToken}` },
        body: form,
      });
      if (res.status === 201) {
        const body = await res.json();
        createdFiles.push(body.data.filename);
      } else if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert.equal(hit429, true);
  });
});

