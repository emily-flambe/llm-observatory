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

  // Map model IDs to actual companies (not hosting providers)
  const getCompany = (model: Model): string => {
    const id = model.id.toLowerCase();
    const name = model.model_name.toLowerCase();

    if (id.includes('llama') || name.includes('llama')) return 'Meta';
    if (id.includes('gemma') || name.includes('gemma')) return 'Google';
    if (id.includes('mistral') || name.includes('mistral')) return 'Mistral';
    // Check deepseek before qwen since deepseek-r1-distill-qwen contains both
    if (id.includes('deepseek') || name.includes('deepseek')) return 'DeepSeek';
    if (id.includes('qwen') || id.includes('qwq') || name.includes('qwen')) return 'Alibaba';
    if (model.provider === 'openai') return 'OpenAI';
    if (model.provider === 'anthropic') return 'Anthropic';
    if (model.provider === 'google') return 'Google';
    return model.provider;
  };

  // Group models by company
  const modelsByCompany = models.reduce(
    (acc, model) => {
      const company = getCompany(model);
      if (!acc[company]) acc[company] = [];
      acc[company].push(model);
      return acc;
    },
    {} as Record<string, Model[]>
  );

  // Sort companies alphabetically
  const sortedCompanies = Object.keys(modelsByCompany).sort();

  // Model documentation URLs
  const getModelUrl = (model: Model): string => {
    const name = model.model_name.toLowerCase();
    const id = model.id.toLowerCase();

    // OpenAI
    if (name.includes('gpt-4o')) return 'https://platform.openai.com/docs/models/gpt-4o';

    // Anthropic
    if (name.includes('claude-sonnet-4-5') || name.includes('claude-sonnet-4.5'))
      return 'https://www.anthropic.com/claude/sonnet';
    if (name.includes('claude-sonnet')) return 'https://www.anthropic.com/claude/sonnet';

    // Google
    if (name.includes('gemini')) return 'https://ai.google.dev/gemini-api/docs/models/gemini';
    if (name.includes('gemma')) return 'https://ai.google.dev/gemma';

    // Meta
    if (name.includes('llama-4')) return 'https://www.llama.com/';
    if (name.includes('llama-3.3')) return 'https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_3/';
    if (name.includes('llama-3.1') || name.includes('llama-3')) return 'https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_1/';

    // Mistral
    if (id.includes('mistral')) return 'https://mistral.ai/news/mistral-small-3/';

    // Alibaba/Qwen
    if (id.includes('qwq')) return 'https://qwenlm.github.io/blog/qwq-32b/';
    if (id.includes('qwen3')) return 'https://qwenlm.github.io/blog/qwen3/';

    // DeepSeek
    if (id.includes('deepseek')) return 'https://www.deepseek.com/';

    // xAI/Grok
    if (name.includes('grok')) return 'https://x.ai/grok';

    return '#';
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedCompanies.map((company) => (
            <div key={company} className="bg-white border border-border rounded-lg p-4">
              <h3 className="font-medium text-ink mb-2">{company}</h3>
              <ul className="space-y-2">
                {modelsByCompany[company].map((model) => {
                  const url = getModelUrl(model);
                  return (
                    <li key={model.id}>
                      <div className="text-sm text-ink">{model.display_name}</div>
                      {url !== '#' ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber hover:text-amber-light font-mono"
                        >
                          {model.model_name}
                        </a>
                      ) : (
                        <div className="text-xs text-ink-muted font-mono">{model.model_name}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
