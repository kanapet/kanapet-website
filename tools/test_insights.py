"""Exercise automatic cards and related articles as the content library grows."""
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import build_insights as builder

source=next((builder.ROOT/'content/insights').glob('*.md')).read_text(encoding='utf-8')
_,metadata,body=source.split('---',2)
with tempfile.TemporaryDirectory(dir=builder.ROOT, prefix='insights-test-') as directory:
    assert Path(directory).resolve().is_relative_to(builder.ROOT.resolve())
    content=Path(directory)/'content/insights'; content.mkdir(parents=True)
    for index in range(4):
        article=json.loads(metadata)
        article['slug']=f'example-article-{index}'
        article['title']=f'Example article {index}'
        article['featured']=index==0
        article['category']='Manufacturing' if index else 'OEM / ODM'
        (content/(article['slug']+'.md')).write_text('---\n'+json.dumps(article)+'\n---\n'+body,encoding='utf-8')
    with patch.object(builder,'ROOT',Path(directory)):
        output=builder.build()
    listing=output[builder.PUBLIC/'insights/index.html']
    assert listing.count('data-category=')==4
    assert listing.count('ins-featured')==1
    detail=output[builder.PUBLIC/'insights/example-article-0/index.html']
    assert 'Related Articles' in detail and detail.count('data-category=')==3
    assert 'example-article-1/' in output[builder.PUBLIC/'sitemap.xml']
assert '&lt;script&gt;' in builder.inline('<script>')
assert 'href="javascript:' not in builder.inline('[bad](javascript:alert)')
print('Insights content growth tests passed: featured article, cards, related articles and sitemap')
