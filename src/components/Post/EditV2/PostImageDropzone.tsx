import { Anchor, Progress, Text } from '@mantine/core';
import { useEffect } from 'react';
import { ContentPolicyLink } from '~/components/ContentPolicyLink/ContentPolicyLink';
import { MediaDropzone } from '~/components/Image/ImageDropzone/MediaDropzone';
import { usePostEditContext } from '~/components/Post/EditV2/PostEditor';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { MediaUploadOnCompleteProps, useMediaUpload } from '~/hooks/useMediaUpload';
import { POST_IMAGE_LIMIT, constants } from '~/server/common/constants';
import { IMAGE_MIME_TYPE, VIDEO_MIME_TYPE } from '~/server/common/mime-types';
import { PostDetailEditable } from '~/server/services/post.service';
import { orchestratorMediaTransmitter } from '~/store/post-image-transmitter.store';
import { trpc } from '~/utils/trpc';
import { showErrorNotification } from '~/utils/notifications';
import { addPostImageSchema } from '~/server/schema/post.schema';
import { usePostImagesContext } from '~/components/Post/EditV2/PostImagesProvider';

const max = POST_IMAGE_LIMIT;

type ControlledImage = Partial<PostDetailEditable['images'][number]> & MediaUploadOnCompleteProps;

export function PostImageDropzone({
  onCreatePost,
}: {
  onCreatePost?: (post: PostDetailEditable) => void;
}) {
  // #region [state]
  const queryUtils = trpc.useUtils();
  const { post, params } = usePostEditContext();
  const { images, setImages } = usePostImagesContext((state) => state);
  const currentUser = useCurrentUser();
  const { src, modelVersionId, tag } = params;
  // #endregion

  // #region [mutations]
  const createPostMutation = trpc.post.create.useMutation();
  const addImageMutation = trpc.post.addImage.useMutation({
    onSuccess: (data) =>
      setImages((images) => [...images, { status: 'added', ...data } as ControlledImage]),
  });
  // #endregion

  // #region [upload images]
  const { files, canAdd, error, upload, progress } = useMediaUpload({
    count: images.length,
    max,
    maxSize: [{ type: 'image', maxSize: constants.mediaUpload.maxImageFileSize }],
    onComplete: (props) => {
      const { postId, modelVersionId } = params;
      if (!postId) throw new Error('missing post id');
      const index = Math.max(0, ...images.map((x) => x.index)) + 1;
      switch (props.status) {
        case 'added':
          const payload = addPostImageSchema.parse({
            ...props,
            postId,
            modelVersionId,
            index,
          });
          return addImageMutation.mutate(payload);
        case 'blocked':
          return setImages((images) => [...images, { ...props, index }]);
      }
    },
  });
  // #endregion

  // #region [handlers]
  const handleDrop = (files: File[]) => {
    if (currentUser?.muted) return;
    if (post) upload(files);
    else {
      createPostMutation.mutate(
        { modelVersionId, tag },
        {
          onSuccess: (data) => {
            queryUtils.post.getEdit.setData({ id: data.id }, () => data);
            upload(files);
            onCreatePost?.(data);
          },
          onError(error) {
            showErrorNotification({
              title: 'Failed to create post',
              error: new Error(error.message),
            });
          },
        }
      );
    }
  };
  // #endregion

  // #region [orchestrator files]
  useEffect(() => {
    async function handleSrc() {
      if (!src) return;
      const files = await orchestratorMediaTransmitter.getFiles(src);
      if (files.length) handleDrop([...files]);
    }
    handleSrc();
  }, []); // eslint-disable-line
  // #endregion

  return (
    <div className={`flex flex-col gap-1`}>
      <div className="w-full">
        <MediaDropzone
          onDrop={handleDrop}
          accept={[...IMAGE_MIME_TYPE, ...VIDEO_MIME_TYPE]}
          disabled={!canAdd}
          error={error}
          max={max}
          loading={createPostMutation.isLoading}
        />
      </div>
      {!!files.length && <Progress value={progress} animate size="lg" />}
      {!files.length && (
        <Text size="xs" align="center">
          By uploading images to our site you agree to our{' '}
          <Anchor href="/content/tos" target="_blank" rel="nofollow" span>
            Terms of service
          </Anchor>
          . Be sure to read our <ContentPolicyLink /> before uploading any images.
        </Text>
      )}
    </div>
  );
}
