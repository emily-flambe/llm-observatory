import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Model } from '../types';

export default function Landing() {
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => setModels(data.models || []));
  }, []);

  // Group models by provider
  const modelsByProvider = models.reduce(
    (acc, model) => {
      const provider = model.provider;
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    },
    {} as Record<string, Model[]>
  );

  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    cloudflare: 'Cloudflare Workers AI',
  };

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <section>
        <p className="text-ink-light text-lg leading-relaxed">
          Compare how different AI models respond to the same prompts. Collect structured responses
          on specific topics, or test freeform prompts across multiple models simultaneously.
        </p>
      </section>

      {/* Features */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/prompt-lab"
          className="bg-white border border-border rounded-lg p-5 hover:border-amber transition-colors"
        >
          <h3 className="font-semibold text-ink mb-2">Prompt Lab</h3>
          <p className="text-sm text-ink-muted">
            Send any prompt to multiple models at once and compare their responses side-by-side.
          </p>
        </Link>
        <Link
          to="/collect"
          className="bg-white border border-border rounded-lg p-5 hover:border-amber transition-colors"
        >
          <h3 className="font-semibold text-ink mb-2">Collect</h3>
          <p className="text-sm text-ink-muted">
            Gather structured responses on predefined topics using prompt templates. Data is stored
            for later analysis.
          </p>
        </Link>
        <Link
          to="/browse"
          className="bg-white border border-border rounded-lg p-5 hover:border-amber transition-colors"
        >
          <h3 className="font-semibold text-ink mb-2">Browse</h3>
          <p className="text-sm text-ink-muted">
            View and compare collected responses across models for each topic.
          </p>
        </Link>
      </section>

      {/* Models */}
      <section>
        <h2 className="text-lg font-semibold text-ink mb-4">Supported Models</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
            <div key={provider} className="bg-white border border-border rounded-lg p-4">
              <h3 className="font-medium text-ink mb-2">{providerNames[provider] || provider}</h3>
              <ul className="space-y-1">
                {providerModels.map((model) => (
                  <li key={model.id} className="text-sm text-ink-muted">
                    {model.display_name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
