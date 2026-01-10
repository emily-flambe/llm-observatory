import type { Topic } from '../types';

interface TopicListProps {
  topics: Topic[];
  selectedTopic: Topic | null;
  onSelectTopic: (topic: Topic) => void;
}

export default function TopicList({ topics, selectedTopic, onSelectTopic }: TopicListProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Topics</h2>
      <ul className="space-y-1">
        {topics.map(topic => (
          <li key={topic.id}>
            <button
              onClick={() => onSelectTopic(topic)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                selectedTopic?.id === topic.id
                  ? 'bg-amber text-white'
                  : 'text-ink hover:bg-paper-dark'
              }`}
            >
              <div className="font-medium">{topic.name}</div>
              {topic.description && (
                <div className={`text-xs mt-0.5 truncate ${
                  selectedTopic?.id === topic.id ? 'text-white/80' : 'text-ink-muted'
                }`}>{topic.description}</div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
