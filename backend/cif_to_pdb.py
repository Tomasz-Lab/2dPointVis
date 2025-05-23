#!/usr/bin/env python
"""
Script to convert between mmCIF and PDB formats.

usage: 
  python cif_to_pdb.py --cif2pdb ciffile [pdbfile]
  python cif_to_pdb.py --pdb2cif pdbfile [ciffile]

Requires python BioPython (`pip install biopython`). It should work with recent version of python 2 or 3.

@author Spencer Bliven <spencer.bliven@gmail.com>
"""

import sys
import argparse
import logging
from Bio.PDB.MMCIFParser import MMCIFParser
from Bio.PDB.PDBParser import PDBParser
from Bio.PDB import PDBIO
from Bio.PDB import MMCIFIO

def int_to_chain(i,base=62):
    """
    int_to_chain(int,int) -> str

    Converts a positive integer to a chain ID. Chain IDs include uppercase
    characters, numbers, and optionally lowercase letters.

    i = a positive integer to convert
    base = the alphabet size to include. Typically 36 or 62.
    """
    if i < 0:
        raise ValueError("positive integers only")
    if base < 0 or 62 < base:
        raise ValueError("Invalid base")

    quot = int(i)//base
    rem = i%base
    if rem < 26:
        letter = chr( ord("A") + rem)
    elif rem < 36:
        letter = str( rem-26)
    else:
        letter = chr( ord("a") + rem - 36)
    if quot == 0:
        return letter
    else:
        return int_to_chain(quot-1,base) + letter

class OutOfChainsError(Exception): pass
def rename_chains(structure):
    """Renames chains to be one-letter chains
    
    Existing one-letter chains will be kept. Multi-letter chains will be truncated
    or renamed to the next available letter of the alphabet.
    
    If more than 62 chains are present in the structure, raises an OutOfChainsError
    
    Returns a map between new and old chain IDs, as well as modifying the input structure
    """
    next_chain = 0 #
    # single-letters stay the same
    chainmap = {c.id:c.id for c in structure.get_chains() if len(c.id) == 1}
    for o in structure.get_chains():
        if len(o.id) != 1:
            if o.id[0] not in chainmap:
                chainmap[o.id[0]] = o.id
                o.id = o.id[0]
            else:
                c = int_to_chain(next_chain)
                while c in chainmap:
                    next_chain += 1
                    c = int_to_chain(next_chain)
                    if next_chain >= 62:
                        raise OutOfChainsError()
                chainmap[c] = o.id
                o.id = c
    return chainmap

def cif_to_pdb(ciffile: str, pdbfile: str, verbose: bool = False) -> None:
    """Convert mmCIF file to PDB format
    
    Args:
        ciffile (str): Path to input CIF file
        pdbfile (str): Path to output PDB file
        verbose (bool): If True, print detailed information
    """
    #Not sure why biopython needs this to read a cif file
    strucid = ciffile[:4] if len(ciffile)>4 else "1xxx"

    # Read file
    parser = MMCIFParser()
    structure = parser.get_structure(strucid, ciffile)
    
    # rename long chains
    try:
        chainmap = rename_chains(structure)
    except OutOfChainsError:
        logging.error("Too many chains to represent in PDB format")
        sys.exit(1)
    
    if verbose:
        for new,old in chainmap.items():
            if new != old:
                logging.info("Renaming chain {0} to {1}".format(old,new))

    #Write PDB
    io = PDBIO()
    io.set_structure(structure)
    io.save(pdbfile)
    
def pdb_to_cif(pdbfile, ciffile, verbose=False):
    """Convert PDB file to mmCIF format
    
    Args:
        pdbfile (str): Path to input PDB file
        ciffile (str): Path to output CIF file
        verbose (bool): If True, print detailed information
    """
    strucid = pdbfile[:4] if len(pdbfile)>4 else "1xxx"
    
    # Read PDB file
    parser = PDBParser(QUIET=not verbose)
    structure = parser.get_structure(strucid, pdbfile)
    
    # Write CIF file
    io = MMCIFIO()
    io.set_structure(structure)
    io.save(ciffile)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Convert between mmCIF and PDB formats')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--cif2pdb", action="store_true", help="Convert from CIF to PDB")
    group.add_argument("--pdb2cif", action="store_true", help="Convert from PDB to CIF")
    parser.add_argument("infile", help="Input file (CIF or PDB)")
    parser.add_argument("outfile", nargs="?", help="Output file. Default based on input filename")
    parser.add_argument("-v", "--verbose", help="Long messages", 
                        dest="verbose", default=False, action="store_true")
    args = parser.parse_args()

    logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.DEBUG if args.verbose else logging.WARN)

    if args.cif2pdb:
        ciffile = args.infile
        pdbfile = args.outfile or ciffile+".pdb"
        cif_to_pdb(ciffile, pdbfile, args.verbose)
    elif args.pdb2cif:
        pdbfile = args.infile
        ciffile = args.outfile or pdbfile+".cif"
        pdb_to_cif(pdbfile, ciffile, args.verbose)

