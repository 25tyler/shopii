import React from 'react';

export function WelcomeMessage() {
  const suggestions = [
    'Best wireless headphones under $300',
    'Mechanical keyboard for coding',
    'Coffee maker for small apartments',
    'Running shoes for beginners',
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-shopii-primary to-shopii-secondary flex items-center justify-center mb-4">
        <span className="text-white text-2xl font-bold">S</span>
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">Welcome to Shopii</h2>
      <p className="text-slate-400 text-center text-sm mb-6 max-w-xs">
        Find products people actually love. I analyze Reddit, YouTube, and expert reviews to give you honest ratings.
      </p>

      <div className="w-full space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Try asking:</p>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="w-full text-left px-4 py-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-300 hover:text-white transition-colors"
          >
            "{suggestion}"
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <RedditIcon className="w-4 h-4" />
          <span>Reddit</span>
        </div>
        <div className="flex items-center gap-1">
          <YouTubeIcon className="w-4 h-4" />
          <span>YouTube</span>
        </div>
        <div className="flex items-center gap-1">
          <ExpertIcon className="w-4 h-4" />
          <span>Experts</span>
        </div>
      </div>
    </div>
  );
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

function ExpertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
