import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import { Node } from '@tiptap/react';
import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { editorMediaUrl } from './support';

/**
 * An audio or video player for an uploaded file. It is a block of its own that
 * cannot be typed into; while editing it shows a real player, and the page
 * keeps `src="media:<id>"`.
 */
function mediaPlayer(name: 'audio' | 'video', projectId: string) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return { src: { default: null } };
    },
    parseHTML() {
      return [{ tag: `${name}[src]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [name, { src: HTMLAttributes['src'], controls: 'controls' }];
    },
    addNodeView() {
      return ({ node }) => {
        const dom: HTMLElement = document.createElement(name);
        dom.setAttribute('controls', 'controls');
        dom.setAttribute('preload', 'metadata');
        dom.setAttribute(
          'src',
          editorMediaUrl(projectId, String(node.attrs['src'] ?? ''))
        );
        dom.setAttribute('aria-label', `${name} player`);
        dom.style.display = 'block';
        dom.style.maxWidth = '100%';
        return { dom };
      };
    },
  });
}

/** Images show the uploaded file while editing and keep `media:<id>` in the page. */
function mediaImage(projectId: string) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const dom: HTMLImageElement = document.createElement('img');
        const apply = (attrs: Record<string, unknown>): void => {
          dom.setAttribute(
            'src',
            editorMediaUrl(projectId, String(attrs['src'] ?? ''))
          );
          dom.setAttribute('alt', String(attrs['alt'] ?? ''));
        };
        apply(node.attrs);
        return {
          dom,
          update: (updated) => {
            if (updated.type.name !== 'image') {
              return false;
            }
            apply(updated.attrs);
            return true;
          },
        };
      };
    },
  }).configure({ inline: true });
}

/**
 * The visual editor's building blocks. They are limited to what the server
 * keeps when a page is saved (`sanitize.ts`): headings start at h3 because the
 * page title is the h2, and there is no strike-through or other markup that
 * would be removed on save.
 */
export function createExtensions(projectId: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [3, 4, 5, 6] },
      strike: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: false, protocols: ['mailto'] },
    }),
    Subscript,
    Superscript,
    Highlight,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    mediaImage(projectId),
    mediaPlayer('audio', projectId),
    mediaPlayer('video', projectId),
  ];
}
