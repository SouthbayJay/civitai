import { ImageIngestionStatus } from '@prisma/client';
import { useMemo } from 'react';
import { useBrowsingLevelDebounced } from '~/components/BrowsingLevel/BrowsingLevelProvider';
import { useHiddenPreferencesContext } from '~/components/HiddenPreferences/HiddenPreferencesProvider';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { Flags } from '~/shared/utils';
import { isDefined, paired } from '~/utils/type-guards';

export function useApplyHiddenPreferences<
  T extends keyof BaseDataTypeMap,
  TData extends BaseDataTypeMap[T]
>({
  type,
  data,
  showHidden,
  disabled,
}: {
  type: T;
  data?: TData;
  showHidden?: boolean;
  disabled?: boolean;
}) {
  const currentUser = useCurrentUser();
  const isModerator = !!currentUser?.isModerator;
  const browsingLevel = useBrowsingLevelDebounced();

  function nsfwLevelFilter<T extends { nsfwLevel: number }>(isOwner: boolean, item: T) {
    if ((isOwner || isModerator) && item.nsfwLevel === 0) return true;
    if (!Flags.hasOverlap(item.nsfwLevel, browsingLevel)) return false;
  }
  const { hiddenModels, hiddenImages, hiddenTags, hiddenUsers, hiddenLoading, isSfw } =
    useHiddenPreferencesContext();

  const items = useMemo(
    () => {
      if (disabled) return data ?? [];
      if (hiddenLoading || !data) return [];
      const { key, value } = paired<BaseDataTypeMap>(type, data);

      function filter() {
        switch (key) {
          case 'models':
            return value
              .filter((model) => {
                const userId = model.user.id;
                const isOwner = userId === currentUser?.id;
                if ((isOwner || isModerator) && model.nsfwLevel === 0) return true;
                if (!Flags.hasOverlap(model.nsfwLevel, browsingLevel)) return false;
                if (userId && hiddenUsers.get(userId)) return false;
                if (hiddenModels.get(model.id) && !showHidden) return false;
                for (const tag of model.tags ?? []) if (hiddenTags.get(tag)) return false;
                return true;
              })
              .map(({ images, ...x }) => {
                const filteredImages =
                  images?.filter((i) => {
                    if (hiddenImages.get(i.id)) return false;
                    for (const tag of i.tags ?? []) if (hiddenTags.get(tag)) return false;
                    return true;
                  }) ?? [];
                return filteredImages.length
                  ? {
                      ...x,
                      images: filteredImages,
                    }
                  : null;
              })
              .filter(isDefined);
          case 'images':
            return value.filter((image) => {
              const userId = image.userId ?? image.user?.id;
              const isOwner = userId && userId === currentUser?.id;
              if ((isOwner || isModerator) && image.nsfwLevel === 0) return true;
              if (!Flags.hasOverlap(image.nsfwLevel, browsingLevel)) return false;
              if (userId && hiddenUsers.get(userId)) return false;
              if (hiddenImages.get(image.id) && !showHidden) return false;
              for (const tag of image.tagIds ?? []) if (hiddenTags.get(tag)) return false;
              return true;
            });
          case 'articles':
            return value.filter((article) => {
              if (article.user && article.user.id === currentUser?.id && !isSfw) return true;
              if (article.user && hiddenUsers.get(article.user.id)) return false;
              for (const tag of article.tags ?? []) if (hiddenTags.get(tag.id)) return false;
              if (article.coverImage) {
                if (hiddenImages.get(article.coverImage.id)) return false;
                for (const tag of article.coverImage.tags) if (hiddenTags.get(tag)) return false;
              }
              return true;
            });
          case 'users':
            return value.filter((user) => {
              if (user.id === currentUser?.id && !isSfw) return true;
              if (hiddenUsers.get(user.id)) return false;
              return true;
            });
          case 'collections':
            return value
              .filter((collection) => {
                const userId = collection.userId ?? collection.user?.id;
                if (userId === currentUser?.id && !isSfw) return true;
                if (userId && hiddenUsers.get(userId)) return false;
                if (collection.image) {
                  if (hiddenImages.get(collection.image.id)) return false;
                  for (const tag of collection.image.tagIds ?? [])
                    if (hiddenTags.get(tag)) return false;
                }
                return true;
              })
              .map(({ images, ...x }) => {
                const filteredImages =
                  images?.filter((i) => {
                    if (hiddenImages.get(i.id)) return false;
                    for (const tag of i.tagIds ?? []) if (hiddenTags.get(tag)) return false;
                    return true;
                  }) ?? [];
                return filteredImages.length
                  ? {
                      ...x,
                      images: filteredImages,
                    }
                  : null;
              })
              .filter(isDefined);
          case 'bounties':
            return value
              .filter((bounty) => {
                if (bounty.user.id === currentUser?.id && !isSfw) return true;
                if (hiddenUsers.get(bounty.user.id)) return false;
                for (const image of bounty.images ?? [])
                  if (hiddenImages.get(image.id)) return false;
                for (const tag of bounty.tags ?? []) if (hiddenTags.get(tag)) return false;
                return true;
              })
              .map(({ images, ...x }) => {
                const filteredImages = images?.filter((i) => {
                  if (hiddenImages.get(i.id)) return false;
                  for (const tag of i.tagIds ?? []) if (hiddenTags.get(tag)) return false;
                  return true;
                });
                return filteredImages.length
                  ? {
                      ...x,
                      images: filteredImages,
                    }
                  : null;
              })
              .filter(isDefined);
          case 'posts':
            return value
              .filter((post) => {
                if (post.user.id === currentUser?.id && !isSfw) return true;
                if (hiddenUsers.get(post.user.id)) return false;
                if (post.image) {
                  if (hiddenImages.get(post.image.id)) return false;
                  for (const tag of post.image.tagIds ?? []) if (hiddenTags.get(tag)) return false;
                }
                return true;
              })
              .map((post) => {
                const images = post.images;
                if (!images) return post;
                const filteredImages = images.filter((image) => {
                  if (hiddenImages.get(image.id)) return false;
                  if (image.ingestion && image.ingestion !== ImageIngestionStatus.Scanned)
                    return false;
                  for (const tag of image.tagIds ?? []) if (hiddenTags.get(tag)) return false;
                  return true;
                });
                return filteredImages.length ? { ...post, images: filteredImages } : null;
              })
              .filter(isDefined);
          default:
            throw new Error('unhandled hidden user preferences filter type');
        }
      }

      // console.time('useApplyHiddenFilters');
      const filtered = filter();
      // console.timeEnd('useApplyHiddenFilters');
      // console.log({ data, filtered });

      return filtered;
    },
    // eslint-disable-next-line
  [
      data,
      hiddenModels,
      hiddenImages,
      hiddenTags,
      hiddenUsers,
      hiddenLoading,
      isSfw,
      disabled,
    ]
  );

  return {
    loadingPreferences: hiddenLoading,
    items: items as TData,
    hiddenCount: !!data?.length ? data.length - items.length : 0,
  };
}

type BaseImage = {
  id: number;
  userId?: number | null;
  user?: { id: number };
  tagIds?: number[];
  ingestion?: ImageIngestionStatus;
  nsfwLevel: number; // TODO.nsfwLevel - apply to other entities
};

type BaseModel = {
  id: number;
  user: { id: number };
  images: { id: number; tags?: number[]; nsfwLevel: number }[];
  tags?: number[];
  nsfwLevel: number;
};

type BaseArticle = {
  id: number;
  user: { id: number };
  nsfwLevel: number;
  tags?: {
    id: number;
  }[];
  coverImage?: {
    id: number;
    tags: number[];
    nsfwLevel: number;
  };
};

type BaseUser = {
  id: number;
};

type BaseCollection = {
  id: number;
  userId?: number | null;
  user?: { id: number };
  nsfwLevel: number;
  image: {
    id: number;
    tagIds?: number[];
    nsfwLevel: number;
  } | null;
  images: {
    id: number;
    tagIds?: number[];
    nsfwLevel: number;
  }[];
};

type BaseBounty = {
  id: number;
  user: { id: number };
  tags?: number[];
  nsfwLevel: number;
  images: {
    id: number;
    tagIds?: number[];
    nsfwLevel: number;
  }[];
};

type BasePost = {
  // id: number;
  user: { id: number };
  nsfwLevel: number;
  image?: {
    id: number;
    tagIds?: number[];
    nsfwLevel: number;
  };
  images?: {
    id: number;
    tagIds?: number[];
    ingestion?: ImageIngestionStatus;
    nsfwLevel: number;
  }[];
};

export type BaseDataTypeMap = {
  images: BaseImage[];
  models: BaseModel[];
  articles: BaseArticle[];
  users: BaseUser[];
  collections: BaseCollection[];
  bounties: BaseBounty[];
  posts: BasePost[];
};
