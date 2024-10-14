# Protein Structure Landscape Visualization

This project provides an interactive visualization tool for exploring large protein databases, revealing structural complementarity and functional locality across different protein sources.

## Overview

The Protein Structure Landscape Visualization tool allows researchers and bioinformaticians to explore and analyze protein structures from various databases, including:

- AlphaFold Protein Structure Database (AFDB)
- ESMAtlas
- Microbiome Immunity Project (MIP)

The tool presents a unified, low-dimensional representation of the protein space, enabling users to investigate the relationships between protein structure, function, and origin.

## Features

- Interactive 2D scatter plot visualization of protein structures
- Filtering options for protein length, pLDDT scores, and superCOG annotations
- Search functionality to find specific proteins by name
- Detailed information display for selected proteins
- 3D protein structure viewer for individual proteins
- Publication details and contact information

## Technology Stack

- Frontend: React.js with Material-UI for the user interface
- Charting: SciChart for high-performance 2D plotting
- 3D Visualization: PDBe Molstar for protein structure rendering
- Backend: Django (not included in this repository)

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up the environment variable for the backend:
   ```
   VITE_DJANGO_HOST=<your_backend_url>
   ```
4. Run the development server:
   ```
   npm run dev
   ```

## Usage

- Use the scatter plot to explore the protein landscape
- Apply filters to focus on specific subsets of proteins
- Click on data points to view detailed information and 3D structures
- Use the search bar to find proteins by name


## Citing

Szczerbiak P, Szydlowski L, Wydmański W, Renfrew PD, Koehler Leman J, Kosciolek T. Large protein databases reveal structural complementarity and functional locality. bioRxiv.

DOI: [https://doi.org/10.1101/2024.08.14.607935](https://doi.org/10.1101/2024.08.14.607935)

```
@article{szczerbiak_large_2024,
	title = {Large protein databases reveal structural complementarity and functional locality},
	url = {https://www.biorxiv.org/content/early/2024/08/17/2024.08.14.607935},
	doi = {10.1101/2024.08.14.607935},
	abstract = {Recent breakthroughs in protein structure prediction have led to an unprecedented surge in high-quality 3D models, highlighting the need for efficient computational solutions to manage and analyze this wealth of structural data. In our work, we comprehensively examine the structural clusters obtained from the AlphaFold Protein Structure Database (AFDB), a high-quality subset of ESMAtlas, and the Microbiome Immunity Project (MIP). We create a single cohesive low-dimensional representation of the resulting protein space. Our results show that, while each database occupies distinct regions within the protein structure space, they collectively exhibit significant overlap in their functional potential. High-level biological functions tend to cluster in particular regions, revealing a shared functional landscape despite the diverse sources of data. To facilitate exploration and improve access to our data, we developed an open-access web server. Our findings lay the groundwork for more in-depth studies concerning protein sequence-structure-function relationships, where various biological questions can be asked about taxonomic assignments, environmental factors, or functional specificity.Competing Interest StatementThe authors have declared no competing interest.},
	journal = {bioRxiv},
	author = {Szczerbiak, Paweł and Szydlowski, Lukasz and Wydmański, Witold and Douglas Renfrew, P. and Leman, Julia Koehler and Kosciolek, Tomasz},
	year = {2024},
	note = {Publisher: Cold Spring Harbor Laboratory
\_eprint: https://www.biorxiv.org/content/early/2024/08/17/2024.08.14.607935.full.pdf},
}
```

## Contact

For questions or support, please contact: wwydmanski@gmail.com
