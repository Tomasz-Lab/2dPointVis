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

## Contact

For questions or support, please contact: wwydmanski@gmail.com