import * as React from 'react'
import { cn } from '@/lib/utils'
import { type UIMessage } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'

interface MessageBubbleProps {
  message: UIMessage
  isStreaming?: boolean
}

export const MessageBubble = React.memo(function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const textContent = React.useMemo(
    () => message.parts
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join(' '),
    [message.parts]
  )

  if (isUser) {
    // User messages: right-aligned with shaded rounded box
    return (
      <div className="flex w-full justify-end px-4 py-3">
        <div className="max-w-[70%] bg-muted/50 rounded-2xl px-4 py-3">
          <div className="text-foreground break-words">
            {textContent}
          </div>
        </div>
      </div>
    )
  }

  // Assistant messages: left-aligned, no background
  return (
    <div className="flex w-full px-4 py-3">
      <div className="flex-1 max-w-none">
        <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
            components={{
              // Custom components for better styling
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              code({ inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <pre className="bg-muted rounded-md p-4 overflow-x-auto">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                ) : (
                  <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                    {children}
                  </code>
                )
              },
              // Ensure links open in new tab
              a({ href, children, ...props }) {
                return (
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:text-blue-800 underline"
                    {...props}
                  >
                    {children}
                  </a>
                )
              },
              // Style tables better
              table({ children, ...props }) {
                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300" {...props}>
                      {children}
                    </table>
                  </div>
                )
              },
              th({ children, ...props }) {
                return (
                  <th className="border border-gray-300 px-4 py-2 bg-muted font-medium text-left" {...props}>
                    {children}
                  </th>
                )
              },
              td({ children, ...props }) {
                return (
                  <td className="border border-gray-300 px-4 py-2" {...props}>
                    {children}
                  </td>
                )
              }
            }}
          >
            {textContent}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Only re-render if message content or streaming state changes
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.parts[0]?.text === nextProps.message.parts[0]?.text &&
         prevProps.isStreaming === nextProps.isStreaming
})