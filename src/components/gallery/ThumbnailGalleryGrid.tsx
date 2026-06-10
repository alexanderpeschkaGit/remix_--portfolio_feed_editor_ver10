import React, { useState } from 'react';
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
import { Upload } from 'lucide-react';

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
  handleImageUpload: (postId: string, file: File, mediaIndex?: number, isNew?: boolean) => void;
  handleVideoFileUpload: (postId: string, file: File) => void;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleVideoLinkChange: (postId: string, url: string) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  setSelectedImage: (post: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  handleToggleHidden: (postId: string) => void;
  // Display functions
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  formatDescription: (description: string, title: string) => string;
  isValidImageCandidate?: (url?: string) => boolean;
  bunnyProgress?: Record<string, { step: string; progress: number; text: string }>;
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
  handleVideoFileUpload,
  handlePostChange,
  handleVideoLinkChange,
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
  formatDescription,
  isValidImageCandidate,
  bunnyProgress,
}: ThumbnailGalleryGridProps) {
  const [isDraggingOverGrid, setIsDraggingOverGrid] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(0);

  // Handle drop of files into the gallery
  const handleGridDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverGrid(false);

    if (!isEditing || flickrPosts.length === 0) return;

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/') || file.type.startsWith('video/')
    );

    if (files.length === 0) return;

    // Add files to the first post
    const firstPost = flickrPosts[0];
    files.forEach((file, index) => {
      // Slight delay to prevent race conditions
      setTimeout(() => {
        if (file.type.startsWith('video/')) {
          handleVideoFileUpload(firstPost.id, file);
        } else {
          handleImageUpload(firstPost.id, file, undefined, true);
        }
      }, index * 100);
    });
  };

  const handleGridDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Only trigger file upload overlay if actual files are being dragged
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      if (isEditing) {
        setIsDraggingOverGrid(true);
      }
    }
  };

  const handleGridDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only hide if we're leaving the grid entirely
    if (e.currentTarget === e.target) {
      setIsDraggingOverGrid(false);
    }
  };

  return (
    <div 
      className="relative w-full"
      onDragOver={handleGridDragOver}
      onDragLeave={handleGridDragLeave}
      onDrop={handleGridDrop}
    >
      {/* Drag-over overlay with visual feedback - constrained to grid area */}
      {isDraggingOverGrid && isEditing && (
        <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm pointer-events-auto">
          <div className="sticky top-[50vh] left-1/2 -translate-x-1/2 -translate-y-1/2 w-max bg-blue-500/20 border-2 border-blue-400 border-dashed rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <Upload className="w-16 h-16 text-blue-400 animate-bounce" />
            <span className="text-blue-300 font-bold text-2xl">Drop files to upload</span>
            <span className="text-blue-300/70 text-sm max-w-xs text-center">Files will be added to the first post</span>
            <span className="text-blue-300/50 text-xs mt-2">Images & Videos supported</span>
          </div>
        </div>
      )}
      
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
              handleVideoFileUpload={handleVideoFileUpload}
              handlePostChange={handlePostChange}
              handleVideoLinkChange={handleVideoLinkChange}
              handleDeletePost={handleDeletePost}
              handleMergeDown={handleMergeDown}
              handleUpdatePostMedia={handleUpdatePostMedia}
              setSelectedImage={setSelectedImage}
              handleStateToggle={handleStateToggle}
              handleToggleHidden={handleToggleHidden}
              imageDimensions={imageDimensions}
              getDisplayImage={getDisplayImage}
              isR2Fallback={isR2Fallback}
              isEmbeddedData={isEmbeddedData}
              getImageSrc={getImageSrc}
              getVideoSrc={getVideoSrc}
              handleImageLoad={handleImageLoad}
              formatDescription={formatDescription}
              isValidImageCandidate={isValidImageCandidate}
              bunnyProgress={bunnyProgress}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
    </div>
  );
}
