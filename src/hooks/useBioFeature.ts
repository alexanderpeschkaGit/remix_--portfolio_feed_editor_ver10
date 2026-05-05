import { useState } from 'react';

interface UseBioFeatureReturn {
  portfolioBio: string;
  setPortfolioBio: (bio: string) => void;
  showBioEditor: boolean;
  setShowBioEditor: (show: boolean) => void;
  showPostCommitModal: boolean;
  setShowPostCommitModal: (show: boolean) => void;
  selectedPostForCommit: any | null;
  setSelectedPostForCommit: (post: any | null) => void;
  commitPostSource: 'instagram' | 'flickr' | null;
  setCommitPostSource: (source: 'instagram' | 'flickr' | null) => void;
  handleGetLatestInstagram: (flickrPosts: any[]) => void;
  handleGetLatestFlickr: (flickrPosts: any[]) => void;
  handleCommitPostToPortfolio: (updatePosts: (posts: any[], actionDescription?: string) => void, flickrPosts: any[]) => void;
  resetCommitState: () => void;
}

export function useBioFeature(): UseBioFeatureReturn {
  const [portfolioBio, setPortfolioBio] = useState('');
  const [showBioEditor, setShowBioEditor] = useState(false);
  const [showPostCommitModal, setShowPostCommitModal] = useState(false);
  const [selectedPostForCommit, setSelectedPostForCommit] = useState<any | null>(null);
  const [commitPostSource, setCommitPostSource] = useState<'instagram' | 'flickr' | null>(null);

  const handleGetLatestInstagram = (flickrPosts: any[]) => {
    const instagramPosts = flickrPosts.filter(
      p => p.source === 'instagram' || p.network_name === 'Instagram'
    );
    if (instagramPosts.length === 0) {
      alert('No Instagram posts available. Please scrape Instagram first.');
      return;
    }
    const latestPost = instagramPosts[0];
    setSelectedPostForCommit(latestPost);
    setCommitPostSource('instagram');
    setShowPostCommitModal(true);
  };

  const handleGetLatestFlickr = (flickrPosts: any[]) => {
    const flickrPostsFiltered = flickrPosts.filter(
      p => p.source === 'flickr' || p.network_name === 'Flickr'
    );
    if (flickrPostsFiltered.length === 0) {
      alert('No Flickr posts available. Please scrape Flickr first.');
      return;
    }
    const latestPost = flickrPostsFiltered[0];
    setSelectedPostForCommit(latestPost);
    setCommitPostSource('flickr');
    setShowPostCommitModal(true);
  };

  const handleCommitPostToPortfolio = (
    updatePosts: (posts: any[], actionDescription?: string) => void,
    flickrPosts: any[]
  ) => {
    if (!selectedPostForCommit) return;

    const newPost = {
      ...selectedPostForCommit,
      id: `committed-${Date.now()}-${Math.random()}`
    };

    updatePosts([newPost, ...flickrPosts], 'Letzten Post hinzugefügt');
    resetCommitState();
  };

  const resetCommitState = () => {
    setShowPostCommitModal(false);
    setSelectedPostForCommit(null);
    setCommitPostSource(null);
  };

  return {
    portfolioBio,
    setPortfolioBio,
    showBioEditor,
    setShowBioEditor,
    showPostCommitModal,
    setShowPostCommitModal,
    selectedPostForCommit,
    setSelectedPostForCommit,
    commitPostSource,
    setCommitPostSource,
    handleGetLatestInstagram,
    handleGetLatestFlickr,
    handleCommitPostToPortfolio,
    resetCommitState
  };
}
