#%%
import json
import numpy as np
from sklearn.manifold import TSNE

# %%
# generate 1000 random vectors
vectors = np.random.randn(1000, 300)

# %%
# reduce dimensionality to 2D
tsne = TSNE(n_components=2, random_state=0)
vectors_2d = tsne.fit_transform(vectors)

# %%
# save vectors to json
with open('public/vectors.json', 'w') as outfile:
    json.dump(vectors_2d.tolist(), outfile)

# %%
