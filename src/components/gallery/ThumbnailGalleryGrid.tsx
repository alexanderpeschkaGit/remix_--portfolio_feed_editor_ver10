import React from 'react';
import {
  DndContext,
  closestCenter,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { FeedPostCard } from '../feed/FeedPostCard';

interface ThumbnailGalleryGridProps {
  flickrPosts: any[];
  isEditing: boolean;
  activeUploads: Record<string, number>;
  showResolutions: boolean;
  sensors: any;
  imageDimensions: Record<string, string>;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  // Callbacks
  handleDragEnd: (event: DragEndEvent) => void;
  handleImageUpload: (postId: string, file: File, mediaIndex?: number) => void;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleYoutubeChange: (postId: string, url: string) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  setSelectedImage: (post: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  handleToggleHidden: (postId: string) => void;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  // Display functions
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getResolutionLabel: (media: any, dimensions?: string) => string;
  formatDescription: (description: string, title: string) => string;
  isValidImageCandidate?: (url?: string) => boolean;
}

export function ThumbnailGalleryGrid({
  flickrPosts,
  isEditing,
  activeUploads,
  showResolutions,
  sensors,
  imageDimensions,
  isR2Fallback,
  isEmbeddedData,
  handleDragEnd,
  handleImageUpload,
  handlePostChange,
  handleYoutubeChange,
  handleDeletePost,
  handleMergeDown,
  handleUpdatePostMedia,
  setSelectedImage,
  handleStateToggle,
  handleToggleHidden,
  handleImageLoad,
  getDisplayImage,
  getImageSrc,
  getVideoSrc,
  getResolutionLabel,
  formatDescription,
  isValidImageCandidate,
}: ThumbnailGalleryGridProps) {
  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={flickrPosts.map(p => p.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-[1400px] mx-auto">
          {flickrPosts
            .filter(post => isEditing || !post.hidden)
            .map((post, index) => (
            <FeedPostCard 
              key={post.id} 
              index={index}
              totalPosts={flickrPosts.length}
              post={post}
              isEditing={isEditing}
              activeUploads={activeUploads}
              showResolutions={showResolutions}
              handleImageUpload={handleImageUpload}
              handlePostChange={handlePostChange}
              handleYoutubeChange={handleYoutubeChange}
              handleDeletePost={handleDeletePost}
              handleMergeDown={handleMergeDown}
              handleUpdatePostMedia={handleUpdatePostMedia}
              setSelectedImage={setSelectedImage}
              handleStateToggle={handleStateToggle}
              handleToggleHidden={handleToggleHidden}
              getDisplayImage={getDisplayImage}
              isR2Fallback={isR2Fallback}
              isEmbeddedData={isEmbeddedData}
              getImageSrc={getImageSrc}
              getVideoSrc={getVideoSrc}
              getResolutionLabel={getResolutionLabel}
              formatDescription={formatDescription}
              isValidImageCandidate={isValidImageCandidate}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
