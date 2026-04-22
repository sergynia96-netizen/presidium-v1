const TOPICS = [
  'All',
  'Tech',
  'News',
  'Art',
  'Science',
  'Politics',
  'Humor',
  'Crypto',
  'Education',
];

interface Props {
  active: string;
  onChange: (topic: string) => void;
}

export function TopicFilter({ active, onChange }: Props) {
  return (
    <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
      {TOPICS.map((topic) => (
        <button
          key={topic}
          onClick={() => onChange(topic === 'All' ? '' : topic)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            (active === '' && topic === 'All') || active === topic
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
          }`}
        >
          {topic}
        </button>
      ))}
    </div>
  );
}
