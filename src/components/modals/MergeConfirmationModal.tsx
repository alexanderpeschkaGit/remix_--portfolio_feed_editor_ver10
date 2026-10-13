export const MergeConfirmationModal = ({ isOpen, group, onConfirm, onSkip }: any) => {
  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold text-white mb-4">Projekte zusammenführen?</h2>
        <p className="text-white/70 mb-4">
          Möchtest du die folgenden {group.length} Projekte mit dem Title "{group[0].title}" zusammenführen?
        </p>
        <div className="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
          {group.map((post: any) => (
            <div key={post.id} className="text-sm text-white/50 bg-white/10 p-2 rounded">
              {post.title} ({post.network_name})
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={onSkip} className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded">Nein</button>
          <button onClick={onConfirm} className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded">Ja, zusammenführen</button>
        </div>
      </div>
    </div>
  );
};

