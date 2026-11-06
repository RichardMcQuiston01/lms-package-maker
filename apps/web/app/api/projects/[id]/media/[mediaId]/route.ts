import {
  deleteMedia,
  readMedia,
} from '../../../../../../lib/api/mediaHandlers';
import { signedIn } from '../../../../../../lib/api/routes';

export const dynamic = 'force-dynamic';

interface RouteContext {
  readonly params: Promise<{ id: string; mediaId: string }>;
}

export const GET = signedIn<RouteContext>(
  async (services, user, _request, context): Promise<Response> => {
    const { id, mediaId } = await context.params;
    return readMedia(services.media, user.id, id, mediaId);
  }
);

export const DELETE = signedIn<RouteContext>(
  async (services, user, _request, context): Promise<Response> => {
    const { id, mediaId } = await context.params;
    return deleteMedia(services.media, user.id, id, mediaId);
  }
);
