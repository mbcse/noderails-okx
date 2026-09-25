'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import {
  Bold,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';

function toolbarClass(active: boolean): string {
  return `rounded-lg p-1.5 ${active ? 'bg-[#f0f0ff] text-[#635bff]' : 'text-[#425466] hover:bg-[#f6f9fc]'}`;
}

export function CampaignEditor({
  value,
  onChange,
  onUploadImage,
}: {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [imageUrl, setImageUrl] = useState('https://');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Placeholder.configure({ placeholder: 'Write the update. Add links and images from the toolbar.' }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'min-h-52 px-4 py-3 text-sm leading-relaxed text-[#0a2540] focus:outline-none',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.isEmpty ? '' : instance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (value !== current && !(editor.isEmpty && !value)) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return <div className="min-h-52 rounded-xl border border-[#e3e8ee] bg-white" />;

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!/^https?:\/\//i.test(href)) {
      setError('Links must start with http:// or https://');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
    setError('');
  };

  const applyImageUrl = () => {
    const src = imageUrl.trim();
    if (!/^https:\/\//i.test(src)) {
      setError('Image URLs must start with https://');
      return;
    }
    editor.chain().focus().setImage({ src }).run();
    setImageOpen(false);
    setError('');
  };

  const uploadFile = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const src = await onUploadImage(file);
      editor.chain().focus().setImage({ src, alt: file.name }).run();
      setImageOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not upload image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[#425466]">Body</p>
      <div className="overflow-hidden rounded-xl border border-[#e3e8ee] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[#f0f2f5] px-2 py-1.5">
          <button type="button" className={toolbarClass(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
            <UnderlineIcon className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading">
            <Heading2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullets">
            <List className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <ListOrdered className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(editor.isActive('link') || linkOpen)} onClick={() => { setImageOpen(false); setLinkOpen((v) => !v); setLinkUrl(editor.getAttributes('link').href || 'https://'); }} title="Link">
            <Link2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(imageOpen)} onClick={() => { setLinkOpen(false); setImageOpen((v) => !v); }} title="Image">
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-[#e3e8ee]" />
          <button type="button" className={toolbarClass(false)} onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={toolbarClass(false)} onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {linkOpen && (
          <div className="flex flex-wrap items-end gap-2 border-b border-[#f0f2f5] bg-[#f7f7ff] px-3 py-2">
            <div className="min-w-0 flex-1">
              <Input label="Link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            </div>
            <Button size="sm" onClick={applyLink}>Apply</Button>
          </div>
        )}
        {imageOpen && (
          <div className="space-y-2 border-b border-[#f0f2f5] bg-[#f7f7ff] px-3 py-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input label="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" />
              </div>
              <Button size="sm" variant="secondary" onClick={applyImageUrl}>Insert URL</Button>
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Uploading…' : 'Upload'}
              </Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => void uploadFile(e.target.files?.[0])} />
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {error ? <p className="mt-1.5 text-xs text-[#df1b41]">{error}</p> : null}
    </div>
  );
}
