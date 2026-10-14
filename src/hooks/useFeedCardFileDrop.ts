import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasFileDrag,
  isSupportedImageFile,
} from "../components/feed/post-card/feedPostMediaHelpers";

export interface CardUploadStatus {
  phase: "hover" | "preparing" | "uploading" | "done" | "error";
  message: string;
  count?: number;
}

interface UseFeedCardFileDropParams {
  postId: string;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  activeMediaDrag: {
    sourcePostId: string;
    mediaIndices: number[];
    mediaItem: any;
  } | null;
  handleImageUpload: (
    postId: string,
    file: File,
    mediaIndex?: number,
    isNew?: boolean,
  ) => void;
  handleVideoFileUpload: (postId: string, file: File) => void;
  onCrossPostMediaDrop: (
    sourcePostId: string,
    mediaIndices: number[],
    targetPostId: string,
    targetMediaIndex?: number,
  ) => void;
}

export function useFeedCardFileDrop({
  postId,
  isEditing,
  activeUploads,
  activeMediaDrag,
  handleImageUpload,
  handleVideoFileUpload,
  onCrossPostMediaDrop,
}: UseFeedCardFileDropParams) {
  const [isMediaDragOvered, setIsMediaDragOvered] = useState(false);
  const [isFileDragOverCard, setIsFileDragOverCard] = useState(false);
  const cardDragDepthRef = useRef(0);
  const uploadStatusTimerRef = useRef<number | null>(null);
  const [cardUploadStatus, setCardUploadStatus] =
    useState<CardUploadStatus | null>(null);

  useEffect(() => {
    if (!isEditing) {
      cardDragDepthRef.current = 0;
      setIsFileDragOverCard(false);
      setCardUploadStatus(null);
    }
  }, [isEditing]);

  const showCardFileDropTarget = () => {
    setIsFileDragOverCard(true);
    setCardUploadStatus((prev) => {
      if (
        prev?.phase === "preparing" ||
        prev?.phase === "uploading" ||
        prev?.phase === "hover"
      ) {
        return prev;
      }
      return {
        phase: "hover",
        message: "Dateien hier ablegen, um in dieses Projekt hochzuladen.",
      };
    });
  };

  const clearCardDragState = useCallback(() => {
    cardDragDepthRef.current = 0;
    setIsFileDragOverCard(false);
    setCardUploadStatus((prev) => (prev?.phase === "hover" ? null : prev));
  }, []);

  const clearUploadStatusLater = useCallback((delay = 2200) => {
    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
    }
    uploadStatusTimerRef.current = window.setTimeout(() => {
      setCardUploadStatus(null);
      uploadStatusTimerRef.current = null;
    }, delay);
  }, []);

  useEffect(() => {
    const handleWindowDragEnd = () => clearCardDragState();
    const handleWindowDrop = () => clearCardDragState();
    window.addEventListener("dragend", handleWindowDragEnd);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [clearCardDragState]);

  useEffect(() => {
    return () => {
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
      }
    };
  }, []);

  const queueDroppedFiles = (files: File[], sourceLabel: string) => {
    if (!isEditing) return;
    const filteredFiles = files.filter(
      (file) => isSupportedImageFile(file) || file.type.startsWith("video/"),
    );
    if (filteredFiles.length === 0) return;
    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
      uploadStatusTimerRef.current = null;
    }
    setCardUploadStatus({
      phase: "preparing",
      message: `${filteredFiles.length} Datei${
        filteredFiles.length === 1 ? "" : "en"
      } werden vorbereitet (${sourceLabel})…`,
      count: filteredFiles.length,
    });
    filteredFiles.forEach((file, index) => {
      window.setTimeout(() => {
        if (file.type.startsWith("video/")) {
          handleVideoFileUpload(postId, file);
        } else {
          handleImageUpload(postId, file, undefined, true);
        }
      }, index * 100);
    });
  };

  const handleCardDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current += 1;
    showCardFileDropTarget();
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsMediaDragOvered(true);
      return;
    }
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    showCardFileDropTarget();
  };

  const handleCardDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    setIsMediaDragOvered(false);
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current = Math.max(0, cardDragDepthRef.current - 1);
    if (cardDragDepthRef.current === 0) {
      setIsFileDragOverCard(false);
    }
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      setIsMediaDragOvered(false);
      onCrossPostMediaDrop(
        activeMediaDrag.sourcePostId,
        activeMediaDrag.mediaIndices,
        postId,
        undefined,
      );
      return;
    }
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    clearCardDragState();
    queueDroppedFiles(Array.from(e.dataTransfer.files), "Drag & Drop");
  };

  useEffect(() => {
    const uploadingCount = activeUploads[postId] || 0;
    if (!cardUploadStatus) return;
    if (cardUploadStatus.phase === "preparing" && uploadingCount > 0) {
      setCardUploadStatus((prev) =>
        prev
          ? {
              ...prev,
              phase: "uploading",
              message: `${uploadingCount} Datei${uploadingCount === 1 ? "" : "en"} werden hochgeladen…`,
            }
          : prev,
      );
      return;
    }
    if (cardUploadStatus.phase === "uploading") {
      if (uploadingCount > 0) {
        setCardUploadStatus((prev) =>
          prev
            ? {
                ...prev,
                message: `${uploadingCount} Datei${uploadingCount === 1 ? "" : "en"} werden hochgeladen…`,
              }
            : prev,
        );
        return;
      }
      setCardUploadStatus({
        phase: "done",
        message: "Gespeichert und für R2 synchronisiert.",
        count: cardUploadStatus.count,
      });
      clearUploadStatusLater();
    }
  }, [activeUploads, cardUploadStatus, clearUploadStatusLater, postId]);

  const handleImportInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: string,
    options: { kind: "image" | "video"; mediaIndex?: number; isNew?: boolean },
  ) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (options.kind === "video") {
      queueDroppedFiles(files, sourceLabel);
    } else {
      if (!isEditing) return;
      const filteredFiles = files.filter(isSupportedImageFile);
      if (filteredFiles.length === 0) return;
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
        uploadStatusTimerRef.current = null;
      }
      setCardUploadStatus({
        phase: "preparing",
        message: `${filteredFiles.length} Datei${
          filteredFiles.length === 1 ? "" : "en"
        } werden vorbereitet (${sourceLabel})…`,
        count: filteredFiles.length,
      });
      filteredFiles.forEach((file, index) => {
        window.setTimeout(() => {
          handleImageUpload(postId, file, options.mediaIndex, options.isNew);
        }, index * 100);
      });
    }
    e.target.value = "";
  };

  return {
    isMediaDragOvered,
    setIsMediaDragOvered,
    isFileDragOverCard,
    cardUploadStatus,
    handleCardDragEnter,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
    handleImportInputChange,
  };
}
