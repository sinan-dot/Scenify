export const runtime = 'nodejs';

export async function POST() {
  return new Response(new ArrayBuffer(0), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
