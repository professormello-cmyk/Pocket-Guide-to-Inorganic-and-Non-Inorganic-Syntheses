#!/usr/bin/env python3
"""compute_cases.py
Compute corridor diagnostics from the paper for rows in data/cases.csv.

Columns expected:
- delta_eV
- V_eV
- DeltaOp_eV

Outputs:
- data/cases_computed.csv
"""
import pandas as pd
import numpy as np

def calc(delta, V):
    denom = np.sqrt(delta**2 + 4*V**2)
    R = np.abs(delta)/np.abs(V)
    sin2phi = 0.5*(1 - delta/denom)
    DeltaMix = denom
    return R, sin2phi, DeltaMix

def classifyCRS(dop, R):
    if dop >= 0.5 and R >= 5: return 0
    if dop >= 0.2 and R >= 2: return 1
    if dop >= 0.1 and R >= 1: return 2
    return 3

def main():
    df = pd.read_csv("data/cases.csv")
    R, sin2phi, DeltaMix = calc(df["delta_eV"].to_numpy(), df["V_eV"].to_numpy())
    df["R"] = R
    df["sin2phi"] = sin2phi
    df["DeltaMix_eV"] = DeltaMix
    df["CRS_auto"] = [classifyCRS(d, r) for d, r in zip(df["DeltaOp_eV"], df["R"])]
    df.to_csv("data/cases_computed.csv", index=False)
    print("Wrote data/cases_computed.csv")

if __name__ == "__main__":
    main()
