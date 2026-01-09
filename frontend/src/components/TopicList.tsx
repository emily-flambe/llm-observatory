interface Topic {
  id: string;
  name: string;
  category: string;
}

interface TopicListProps {
  topics: Topic[];
  selectedTopic: Topic | null;
  onSelectTopic: (topic: Topic) => void;
}

export default function TopicList({ topics, selectedTopic, onSelectTopic }: TopicListProps) {
  const categories = [...new Set(topics.map(t => t.category))];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Topics</h2>
      {categories.map(category => (
        <div key={category}>
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
            {category}
          </h3>
          <ul className="space-y-1">
            {topics
              .filter(t => t.category === category)
              .map(topic => (
                <li key={topic.id}>
                  <button
                    onClick={() => onSelectTopic(topic)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                      selectedTopic?.id === topic.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {topic.name}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
