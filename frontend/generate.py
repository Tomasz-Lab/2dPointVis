#%%
import json
import numpy as np
from sklearn.manifold import TSNE

# %%
# generate 1000 random vectors
vectors_2d = np.random.randn(10000, 2)

# %%
# assign datapoints to random classes
classes = np.random.randint(0, 10, len(vectors_2d))
vectors_2d = np.hstack((vectors_2d, classes.reshape(-1, 1)))

# %%
# save vectors to json
with open('public/vectors.json', 'w') as outfile:
    json.dump(vectors_2d.tolist(), outfile)

# %%
