import React, { useState } from 'react';
import { FileItem } from '@/types';
import { cn } from '@/lib/utils';
import { Folder, FolderOpen, FileCode, FileText, ChevronRight, ChevronDown } from 'lucide-react';

interface FileTreeProps {
  files: FileItem[];
  selectedFileId?: string;
  onSelectFile: (file: FileItem) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  file?: FileItem;
  children: Record<string, TreeNode>;
}

export function FileTree({ files, selectedFileId, onSelectFile }: FileTreeProps) {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    src: true,
    'src/payment': true,
    'src/auth': true,
    docs: true,
  });

  // Build tree hierarchy
  const root: TreeNode = { name: 'root', path: '', isFolder: true, children: {} };

  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const currentPath = parts.slice(0, index + 1).join('/');

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          isFolder: !isLast,
          file: isLast ? file : undefined,
          children: {},
        };
      }
      current = current.children[part];
    });
  });

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    if (node.isFolder) {
      const isOpen = openFolders[node.path] ?? true;
      return (
        <div key={node.path} className="select-none">
          {node.path !== '' && (
            <button
              onClick={() => toggleFolder(node.path)}
              className={cn(
                'flex items-center gap-1.5 w-full py-1 px-2 text-xs text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised/60 rounded transition-colors text-left'
              )}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-intel-muted" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-intel-muted" />
              )}
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 text-intel-accent" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-intel-muted" />
              )}
              <span className="font-mono text-[11px] truncate">{node.name}</span>
            </button>
          )}

          {(isOpen || node.path === '') && (
            <div>
              {Object.values(node.children).map((child) =>
                renderNode(child, node.path === '' ? 0 : depth + 1)
              )}
            </div>
          )}
        </div>
      );
    }

    const isSelected = node.file?.id === selectedFileId;
    const isDoc = node.name.endsWith('.md');

    return (
      <button
        key={node.path}
        onClick={() => node.file && onSelectFile(node.file)}
        className={cn(
          'flex items-center gap-2 w-full py-1 px-2 text-xs rounded transition-colors text-left font-mono text-[11px]',
          isSelected
            ? 'bg-intel-accent/15 text-intel-accent font-medium'
            : 'text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised/50'
        )}
        style={{ paddingLeft: `${depth * 12 + 16}px` }}
      >
        {isDoc ? (
          <FileText className="w-3.5 h-3.5 text-intel-muted flex-shrink-0" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-intel-text-secondary flex-shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-intel-surface border-r border-intel-border overflow-y-auto p-2">
      <div className="text-[11px] font-semibold text-intel-muted uppercase tracking-wider px-2 py-1 select-none">
        Explorer
      </div>
      <div className="mt-1 space-y-0.5">{renderNode(root)}</div>
    </div>
  );
}
