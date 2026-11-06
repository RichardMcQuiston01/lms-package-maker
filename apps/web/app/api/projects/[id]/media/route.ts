import { listMedia, uploadMedia } from '../../../../../lib/api/mediaHandlers';
import { signedIn } from '../../../../../lib/api/routes';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

export const GET = signedIn<RouteContext>(
  async (services, user, _request, context): Promise<Response> => {
    const { id } = await context.params;
    return listMedia(services.media, user.id, id);
  }
);

export const POST = signedIn<RouteContext>(
  async (services, user, request, context): Promise<Response> => {
    const { id } = await context.params;
    return uploadMedia(services.media, user.id, id, request);
  }
);
