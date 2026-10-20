-- Default RSS feeds (mirrors src/config/feeds.json). Safe to re-run.
insert into rss_feeds (id, name, url, category, keywords, enabled) values
  ('solana-news',          'Solana News',            'https://solana.com/news/rss.xml',                  'official', '{}', true),
  ('helius-blog',          'Helius Blog',            'https://www.helius.dev/blog/rss.xml',              'project',  '{}', true),
  ('marinade-blog',        'Marinade Blog',          'https://www.marinade.finance/blog/rss.xml',        'project',  '{}', true),
  ('cointelegraph-solana', 'Cointelegraph · Solana', 'https://cointelegraph.com/rss/tag/solana',         'news',     '{}', true),
  ('coindesk',             'CoinDesk',               'https://www.coindesk.com/arc/outboundfeeds/rss/',  'news',     '{solana," sol ",jupiter,phantom,pump.fun,firedancer}', true),
  ('theblock',             'The Block',              'https://www.theblock.co/rss.xml',                  'news',     '{solana," sol ",jupiter,phantom,pump.fun,firedancer}', true),
  ('blockworks',           'Blockworks',             'https://blockworks.co/feed',                       'news',     '{solana," sol ",jupiter,phantom,pump.fun,firedancer}', true),
  ('decrypt',              'Decrypt',                'https://decrypt.co/feed',                          'news',     '{solana," sol ",jupiter,phantom,pump.fun,firedancer}', true),
  ('the-defiant',          'The Defiant',            'https://thedefiant.io/feed',                       'news',     '{solana," sol ",jupiter,phantom,pump.fun,firedancer}', true)
on conflict (id) do nothing;
