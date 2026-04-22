/**
 * @author Ваше Полное Имя
 * @copyright (C) 2026 Ваше Полное Имя. All Rights Reserved.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  content: string;
  topic?: string;
  mediaUrls: string[];
  likes: number;
  dislikes: number;
  comments: number;
  repostCount: number;
  createdAt: string;
  isLiked: boolean;
  isDisliked: boolean;
  isRepost?: boolean;
  originalPostId?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  parentId?: string | null;
  createdAt: string;
}

interface FeedResponse {
  posts: FeedPost[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CommentsResponse {
  comments: Comment[];
  nextCursor: string | null;
}

type RawFeedPost = Omit<
  FeedPost,
  'authorName' | 'authorAvatar'
> & {
  author?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

type RawComment = Omit<Comment, 'authorName' | 'authorAvatar'> & {
  author?: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

function mapPost(post: RawFeedPost): FeedPost {
  return {
    ...post,
    authorName: post.author?.name || 'Unknown',
    authorAvatar: post.author?.avatar || undefined,
  };
}

function mapComment(comment: RawComment): Comment {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    authorName: comment.author?.name || 'Unknown',
    authorAvatar: comment.author?.avatar || undefined,
    content: comment.content,
    parentId: comment.parentId,
    createdAt: comment.createdAt,
  };
}

export function useFeedPosts(topic?: string) {
  return useInfiniteQuery<FeedResponse>({
    queryKey: ['feed', topic || 'all'],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) {
        params.set('cursor', pageParam as string);
      }
      if (topic) {
        params.set('topic', topic);
      }
      params.set('limit', '20');

      const { data } = await api.get(`/feed?${params.toString()}`);
      const posts = ((data.posts || []) as RawFeedPost[]).map(mapPost);
      return {
        posts,
        nextCursor: (data.nextCursor || null) as string | null,
        hasMore: Boolean(data.hasMore),
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    staleTime: 1000 * 30,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      topic?: string;
      mediaKeys?: string[];
    }) => {
      const { data } = await api.post('/feed', payload);
      return mapPost(data.post as RawFeedPost);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useReactToPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      type,
    }: {
      postId: string;
      type: 'like' | 'dislike' | 'none';
    }) => {
      const { data } = await api.post(`/feed/${postId}/react`, { type });
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['post', vars.postId] });
    },
  });
}

export function useComments(postId: string) {
  return useInfiniteQuery<CommentsResponse>({
    queryKey: ['comments', postId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) {
        params.set('cursor', pageParam as string);
      }
      params.set('limit', '20');

      const { data } = await api.get(`/feed/${postId}/comments?${params.toString()}`);
      return {
        comments: ((data.comments || []) as RawComment[]).map(mapComment),
        nextCursor: (data.nextCursor || null) as string | null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    enabled: Boolean(postId),
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      content,
      parentId,
    }: {
      postId: string;
      content: string;
      parentId?: string;
    }) => {
      const { data } = await api.post(`/feed/${postId}/comment`, {
        content,
        parentId,
      });
      return mapComment(data.comment as RawComment);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['comments', vars.postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRepost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { data } = await api.post(`/feed/${postId}/repost`);
      return mapPost(data.post as RawFeedPost);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
