'use client'
import { useState, useEffect, useRef } from 'react'
import { uploadDocument, fetchDocuments, deleteDocument } from '@/lib/api'
import type { UserDocument } from '@/lib/api'

interface DocumentUploadProps {
  isRunning: boolean
}

export default function DocumentUpload({ isRunning }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<UserDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    fetchDocuments().then(setDocuments).catch(() => {})
  }, [])

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const doc = await uploadDocument(file)
      setDocuments(prev => [doc, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (!uploading && !isRunning) setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)
    if (uploading || isRunning) return
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleDelete = async (docId: string) => {
    try {
      await deleteDocument(docId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch {
      setError('Failed to delete document')
    }
  }

  return (
    <div
      className="px-5 pb-3"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Chip row with contained drop overlay */}
      <div className="relative flex flex-wrap items-center gap-1.5">
        {dragging && (
          <div className="absolute -inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent-amber/40 bg-bg-primary/95">
            <div className="flex items-center gap-2.5 text-accent-amber font-(family-name:--font-dm-mono) text-xs">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Drop PDF here
            </div>
          </div>
        )}
        {documents.map(doc => (
          <div
            key={doc.id}
            className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md bg-bg-elevated border border-border-subtle text-text-secondary font-(family-name:--font-dm-mono) group"
          >
            <svg className="w-3 h-3 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate max-w-[200px]">{doc.filename}</span>
            <span className="text-[9px] text-text-muted shrink-0">{doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}</span>
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={isRunning}
              className="text-text-muted hover:text-red-400 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100 -mr-0.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Upload pill */}
        <label className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md border border-dashed cursor-pointer transition-all duration-200 font-(family-name:--font-dm-mono) border-border-subtle text-text-muted hover:text-accent-amber hover:border-accent-amber/30 ${uploading || isRunning ? 'opacity-40 pointer-events-none' : ''}`}>
          {uploading ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          )}
          {uploading ? 'Processing...' : 'Upload PDF'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            disabled={uploading || isRunning}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <div className="text-[10px] text-red-400 font-(family-name:--font-dm-mono) mt-1.5">
          {error}
        </div>
      )}
    </div>
  )
}
