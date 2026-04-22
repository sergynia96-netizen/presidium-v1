'use client';

import { useState } from 'react';
import { CornerDownRight, MessageCircle, Send } from 'lucide-react';

import { type Comment, useAddComment, useComments } from '@/hooks/useFeed';

interface Props {
  postId: string;
  commentCount: number;
}

export function CommentSection({ postId, commentCount }: Props) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useComments(postId);
  const addMutation = useAddComment();

  const comments = data?.pages.flatMap((page) => page.comments) ?? [];
  const topLevel = comments.filter((comment) => !comment.parentId);
  const replies = comments.filter((comment) => comment.parentId);

  const submit = async () => {
    if (!content.trim()) {
      return;
    }

    await addMutation.mutateAsync({
      postId,
      content: content.trim(),
      parentId: replyTo,
    });
    setContent('');
    setReplyTo(undefined);
  };

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-indigo-400"
      >
        <MessageCircle className="h-4 w-4" />
        <span>{commentCount} comments</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
              className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submit().catch((err) => console.error('[Feed] Comment submit failed:', err));
                }
              }}
            />
            <button
              onClick={() => {
                submit().catch((err) => console.error('[Feed] Comment submit failed:', err));
              }}
              disabled={addMutation.isPending || !content.trim()}
              className="rounded-lg bg-indigo-600 p-2 text-white disabled:bg-slate-700 hover:bg-indigo-500"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Replying to comment</span>
              <button
                onClick={() => setReplyTo(undefined)}
                className="text-indigo-400 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="space-y-3">
            {topLevel.map((comment) => (
              <div key={comment.id}>
                <CommentItem comment={comment} onReply={setReplyTo} />
                {replies
                  .filter((reply) => reply.parentId === comment.id)
                  .map((reply) => (
                    <div key={reply.id} className="mt-2 ml-8 flex gap-2">
                      <CornerDownRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-600" />
                      <CommentItem comment={reply} onReply={setReplyTo} isReply />
                    </div>
                  ))}
              </div>
            ))}
          </div>

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more comments'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  onReply,
  isReply,
}: {
  comment: Comment;
  onReply: (id: string) => void;
  isReply?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <img
        src={comment.authorAvatar || '/default-avatar.png'}
        alt=""
        className="h-6 w-6 flex-shrink-0 rounded-full bg-slate-800 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-200">{comment.authorName}</span>
          <span className="text-xs text-slate-500">
            {new Date(comment.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="mt-0.5 break-words text-sm text-slate-300">{comment.content}</p>
        {!isReply && (
          <button
            onClick={() => onReply(comment.id)}
            className="mt-1 text-xs text-slate-500 hover:text-indigo-400"
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}
