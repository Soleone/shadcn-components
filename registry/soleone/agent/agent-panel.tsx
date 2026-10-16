"use client"

import { useId, useState, type Dispatch, type SetStateAction, type ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { ArrowUp, Square, Wrench } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea,
} from "@/components/ui/input-group"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller, MessageScrollerButton, MessageScrollerContent,
  MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import {
  Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger,
  TraceIcon, TraceLine, TraceTitle,
} from "@/components/ui/trace"

export type AgentTool = {
  id: string
  name: string
  label: string
  status: "running" | "complete" | "error"
  output?: string
  data?: unknown
}

export type AgentMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  tools?: AgentTool[]
}

type AgentPanelProps = {
  messages: AgentMessage[]
  prompt: string
  onPromptChange: Dispatch<SetStateAction<string>>
  busy: boolean
  disabled?: boolean
  error?: string
  placeholder?: string
  emptyTitle?: string
  emptyDescription?: string
  onSend: (text: string) => Promise<boolean>
  onStop: () => void
  renderTool?: (tool: AgentTool) => ReactNode
}

function ToolTrace({ tool }: { tool: AgentTool }) {
  const line = (
    <TraceLine status={tool.status === "complete" ? undefined : tool.status}>
      <TraceIcon><Wrench /></TraceIcon>
      <TraceTitle>{tool.status === "error" ? `${tool.label} failed` : tool.label}</TraceTitle>
    </TraceLine>
  )
  return (
    <Trace>
      {tool.output ? (
        <TraceCollapsible>
          <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{tool.output}</pre>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      ) : line}
    </Trace>
  )
}

/** Controlled UI only. The host owns transport, credentials, tools, and approval policy. */
export function AgentPanel({
  messages, prompt, onPromptChange, busy, disabled = false, error, onSend, onStop, renderTool,
  placeholder = "Ask the agent…",
  emptyTitle = "What would you like to do?",
  emptyDescription = "Ask a question or describe a change. You stay in control of what gets applied.",
}: AgentPanelProps) {
  const [sending, setSending] = useState(false)
  const [submissionError, setSubmissionError] = useState("")
  const currentError = error || submissionError
  const promptId = useId()
  const working = busy || sending

  async function send() {
    const text = prompt.trim()
    if (!text || working || disabled) return
    setSending(true)
    setSubmissionError("")
    try {
      if (await onSend(text)) onPromptChange((current) => current.trim() === text ? "" : current)
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not send. Please try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-label="Agent conversation" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent>
                {messages.length === 0 ? (
                  <MessageScrollerItem messageId="empty">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>{emptyTitle}</EmptyTitle>
                        <EmptyDescription>{emptyDescription}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </MessageScrollerItem>
                ) : messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        {message.role === "user" ? (
                          <Bubble align="end" variant="muted">
                            <BubbleContent>{message.text}</BubbleContent>
                          </Bubble>
                        ) : (
                          <div className="flex min-w-0 flex-col gap-3">
                            {message.text && (
                              <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed wrap-break-word">
                                <ReactMarkdown
                                  skipHtml
                                  allowedElements={["p", "strong", "em", "a", "ul", "ol", "li", "code", "pre", "br", "blockquote"]}
                                  components={{
                                    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{children}</a>,
                                    ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
                                    pre: ({ children }) => <pre className="overflow-auto whitespace-pre-wrap">{children}</pre>,
                                  }}
                                >{message.text}</ReactMarkdown>
                              </div>
                            )}
                            {message.tools?.map((tool) => (
                              <div key={tool.id} className="min-w-0">
                                {renderTool?.(tool) ?? <ToolTrace tool={tool} />}
                              </div>
                            ))}
                          </div>
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      {currentError && (
        <Alert variant="destructive">
          <AlertTitle>The agent could not continue</AlertTitle>
          <AlertDescription>{currentError}</AlertDescription>
        </Alert>
      )}
      <form className="shrink-0" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <label htmlFor={promptId} className="sr-only">Message the agent</label>
        <InputGroup>
          <InputGroupTextarea
            id={promptId}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            className="max-h-40"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={4000}
            rows={2}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            {working ? (
              <InputGroupButton type="button" size="sm" variant="outline" onClick={onStop} disabled={sending || disabled}>
                <Square data-icon="inline-start" />Stop
              </InputGroupButton>
            ) : (
              // A disabled empty Send button would make InputGroup dim the editable textarea too.
              <InputGroupButton type="submit" size="sm" variant={prompt.trim() ? "default" : "secondary"} disabled={disabled} aria-disabled={disabled || !prompt.trim()}>
                <ArrowUp data-icon="inline-start" />Send
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p role="status" className="text-xs text-muted-foreground">
        {working ? "Agent working. You can stop it at any time." : "Enter to send. Shift+Enter for a new line."}
      </p>
    </section>
  )
}
