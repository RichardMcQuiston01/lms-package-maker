'use client';

import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import { createExtensions } from '../lib/visualEditor/extensions';
import { normalizeEditorHtml } from '../lib/visualEditor/support';

/** What the page around the editor can ask of it. */
export interface RichTextEditorHandle {
  /** Puts HTML at the caret, replacing any selection. */
  insertHtml(html: string): void;
}

interface RichTextEditorProps {
  readonly projectId: string;
  /** The page HTML the editor starts from; change the `key` to load another. */
  readonly html: string;
  readonly onChange: (html: string) => void;
}

const BUTTON =
  'rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40';
const BUTTON_ON = 'border-blue-600 bg-blue-50 text-blue-900';

interface ToolbarButtonProps {
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: ToolbarButtonProps): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // A mouse click must not pull focus (and the caret) out of the editor.
      onMouseDown={(event): void => event.preventDefault()}
      onClick={onClick}
      className={`${BUTTON} ${active === true ? BUTTON_ON : ''}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { readonly editor: Editor }): ReactNode {
  const [linkOpen, setLinkOpen] = useState<boolean>(false);
  const [linkUrl, setLinkUrl] = useState<string>('');
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      code: current.isActive('code'),
      sub: current.isActive('subscript'),
      sup: current.isActive('superscript'),
      mark: current.isActive('highlight'),
      bullet: current.isActive('bulletList'),
      ordered: current.isActive('orderedList'),
      quote: current.isActive('blockquote'),
      codeBlock: current.isActive('codeBlock'),
      link: current.isActive('link'),
      table: current.isActive('table'),
      heading: [3, 4, 5, 6].find((level: number): boolean =>
        current.isActive('heading', { level })
      ),
      imageAlt: current.isActive('image')
        ? String(current.getAttributes('image')['alt'] ?? '')
        : null,
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  });
  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus();

  function applyLink(): void {
    const address: string = linkUrl.trim();
    if (address === '') {
      chain().extendMarkRange('link').unsetLink().run();
    } else {
      chain().extendMarkRange('link').setLink({ href: address }).run();
    }
    setLinkOpen(false);
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="space-y-2 border-b border-slate-300 bg-slate-50 p-2"
    >
      <div className="flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor="lpm-block-style">
          Text style
        </label>
        <select
          id="lpm-block-style"
          value={state.heading === undefined ? 'p' : String(state.heading)}
          onChange={(event): void => {
            const value: string = event.target.value;
            if (value === 'p') {
              chain().setParagraph().run();
            } else {
              chain()
                .setHeading({ level: Number(value) as 3 | 4 | 5 | 6 })
                .run();
            }
          }}
          className={BUTTON}
        >
          <option value="p">Paragraph</option>
          <option value="3">Heading 1</option>
          <option value="4">Heading 2</option>
          <option value="5">Heading 3</option>
          <option value="6">Heading 4</option>
        </select>
        <ToolbarButton
          label="Bold"
          active={state.bold}
          onClick={(): void => void chain().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={state.italic}
          onClick={(): void => void chain().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={state.underline}
          onClick={(): void => void chain().toggleUnderline().run()}
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          label="Highlight"
          active={state.mark}
          onClick={(): void => void chain().toggleHighlight().run()}
        >
          <mark>H</mark>
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={state.code}
          onClick={(): void => void chain().toggleCode().run()}
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton
          label="Subscript"
          active={state.sub}
          onClick={(): void => void chain().toggleSubscript().run()}
        >
          x<sub>2</sub>
        </ToolbarButton>
        <ToolbarButton
          label="Superscript"
          active={state.sup}
          onClick={(): void => void chain().toggleSuperscript().run()}
        >
          x<sup>2</sup>
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <ToolbarButton
          label="Bulleted list"
          active={state.bullet}
          onClick={(): void => void chain().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.ordered}
          onClick={(): void => void chain().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={state.quote}
          onClick={(): void => void chain().toggleBlockquote().run()}
        >
          “ ”
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={state.codeBlock}
          onClick={(): void => void chain().toggleCodeBlock().run()}
        >
          {'{ }'}
        </ToolbarButton>
        <ToolbarButton
          label="Horizontal rule"
          onClick={(): void => void chain().setHorizontalRule().run()}
        >
          ―
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <ToolbarButton
          label="Link"
          active={state.link}
          onClick={(): void => {
            setLinkUrl(String(editor.getAttributes('link')['href'] ?? ''));
            setLinkOpen((open: boolean): boolean => !open);
          }}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Insert table"
          disabled={state.table}
          onClick={(): void =>
            void chain()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden="true" />
        <ToolbarButton
          label="Undo"
          disabled={!state.canUndo}
          onClick={(): void => void chain().undo().run()}
        >
          Undo
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!state.canRedo}
          onClick={(): void => void chain().redo().run()}
        >
          Redo
        </ToolbarButton>
      </div>

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="lpm-link-url">
            Link address
          </label>
          <input
            id="lpm-link-url"
            value={linkUrl}
            onChange={(event): void => setLinkUrl(event.target.value)}
            onKeyDown={(event): void => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://example.com or mailto:name@example.com"
            className="min-w-64 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
          <button type="button" className={BUTTON} onClick={applyLink}>
            {linkUrl.trim() === '' ? 'Remove link' : 'Apply link'}
          </button>
        </div>
      )}

      {state.table && (
        <div
          role="group"
          aria-label="Table"
          className="flex flex-wrap items-center gap-1"
        >
          <ToolbarButton
            label="Add row below"
            onClick={(): void => void chain().addRowAfter().run()}
          >
            + Row
          </ToolbarButton>
          <ToolbarButton
            label="Delete row"
            onClick={(): void => void chain().deleteRow().run()}
          >
            − Row
          </ToolbarButton>
          <ToolbarButton
            label="Add column after"
            onClick={(): void => void chain().addColumnAfter().run()}
          >
            + Column
          </ToolbarButton>
          <ToolbarButton
            label="Delete column"
            onClick={(): void => void chain().deleteColumn().run()}
          >
            − Column
          </ToolbarButton>
          <ToolbarButton
            label="Toggle header row"
            onClick={(): void => void chain().toggleHeaderRow().run()}
          >
            Header row
          </ToolbarButton>
          <ToolbarButton
            label="Delete table"
            onClick={(): void => void chain().deleteTable().run()}
          >
            Delete table
          </ToolbarButton>
        </div>
      )}

      {state.imageAlt !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="lpm-image-alt">
            Image description (leave empty if decorative)
          </label>
          <input
            id="lpm-image-alt"
            value={state.imageAlt}
            onChange={(event): void =>
              void editor
                .chain()
                .updateAttributes('image', { alt: event.target.value })
                .run()
            }
            className="min-w-64 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}

function RichTextEditorInner(
  { projectId, html, onChange }: RichTextEditorProps,
  ref: ForwardedRef<RichTextEditorHandle>
): ReactNode {
  const extensions = useMemo(() => createExtensions(projectId), [projectId]);
  const editor: Editor | null = useEditor({
    extensions,
    content: html,
    // Next renders on the server first; the editor needs the browser's DOM.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Page content',
        class: 'lpm-editor min-h-72 px-3 py-2 focus:outline-none',
      },
    },
    onUpdate: ({ editor: current }): void =>
      onChange(normalizeEditorHtml(current.getHTML(), current.isEmpty)),
  });

  useImperativeHandle(
    ref,
    (): RichTextEditorHandle => ({
      insertHtml: (snippet: string): void => {
        editor?.chain().focus().insertContent(snippet).run();
      },
    }),
    [editor]
  );

  if (editor === null) {
    return <p className="p-3 text-sm text-slate-500">Loading editor…</p>;
  }
  return (
    <div className="rounded-md border border-slate-300 bg-white focus-within:outline focus-within:outline-2 focus-within:outline-blue-600">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(RichTextEditorInner);
