import { DEFAULT_MAX_MEDIA_BYTES, type MediaService } from '../media/service';
import type { MediaRecord } from '../media/types';
import {
  errorResponse,
  failureResponse,
  isProjectId,
  jsonResponse,
} from './http';

/** Upload, list, view and delete media files, over HTTP. */

/** Room for the multipart envelope around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export interface MediaJson {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly kind: 'image' | 'audio' | 'video';
  readonly byteSize: number;
  readonly url: string;
  readonly createdAt: string;
}

export function toMediaJson(record: MediaRecord): MediaJson {
  const kind = record.contentType.split('/')[0];
  return {
    id: record.id,
    fileName: record.fileName,
    contentType: record.contentType,
    kind: kind === 'audio' || kind === 'video' ? kind : 'image',
    byteSize: record.byteSize,
    url: `/api/projects/${record.projectId}/media/${record.id}`,
    createdAt: record.createdAt.toISOString(),
  };
}

function badId(label: string, id: string): Response {
  return errorResponse(
    400,
    `'${id}' is not a valid ${label} id; expected a UUID`
  );
}

export async function listMedia(
  service: MediaService,
  ownerId: string,
  projectId: string
): Promise<Response> {
  if (!isProjectId(projectId)) {
    return badId('project', projectId);
  }
  const listed = await service.list(projectId, ownerId);
  return listed.ok
    ? jsonResponse({ media: listed.value.map(toMediaJson) })
    : failureResponse(listed);
}

export async function uploadMedia(
  service: MediaService,
  ownerId: string,
  projectId: string,
  request: Request
): Promise<Response> {
  if (!isProjectId(projectId)) {
    return badId('project', projectId);
  }
  const declared = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declared) &&
    declared > DEFAULT_MAX_MEDIA_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    return errorResponse(
      413,
      `The upload is ${(declared / (1024 * 1024)).toFixed(1)} MB, over the ${DEFAULT_MAX_MEDIA_BYTES / (1024 * 1024)} MB limit`
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause: unknown) {
    const reason: string =
      cause instanceof Error ? cause.message : String(cause);
    return errorResponse(
      400,
      `The upload must be multipart/form-data with the file in a field named 'file': ${reason}`
    );
  }
  const file: FormDataEntryValue | null = form.get('file');
  if (file === null || typeof file === 'string') {
    return errorResponse(
      400,
      "The upload needs a file in a field named 'file'"
    );
  }
  const uploaded = await service.upload(projectId, ownerId, {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  return uploaded.ok
    ? jsonResponse({ media: toMediaJson(uploaded.value) }, 201)
    : failureResponse(uploaded);
}

/**
 * Sends a file back for the editor. The headers stop a browser from treating
 * the bytes as anything but the media type that was checked at upload.
 */
export async function readMedia(
  service: MediaService,
  ownerId: string,
  projectId: string,
  mediaId: string
): Promise<Response> {
  if (!isProjectId(projectId)) {
    return badId('project', projectId);
  }
  if (!isProjectId(mediaId)) {
    return badId('media', mediaId);
  }
  const file = await service.read(projectId, ownerId, mediaId);
  if (!file.ok) {
    return failureResponse(file);
  }
  return new Response(Buffer.from(file.value.bytes), {
    status: 200,
    headers: {
      'Content-Type': file.value.record.contentType,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function deleteMedia(
  service: MediaService,
  ownerId: string,
  projectId: string,
  mediaId: string
): Promise<Response> {
  if (!isProjectId(projectId)) {
    return badId('project', projectId);
  }
  if (!isProjectId(mediaId)) {
    return badId('media', mediaId);
  }
  const removed = await service.remove(projectId, ownerId, mediaId);
  return removed.ok
    ? jsonResponse({ deleted: true })
    : failureResponse(removed);
}
