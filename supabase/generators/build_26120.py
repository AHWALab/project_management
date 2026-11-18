#!/usr/bin/env python3
"""
Generates the SQL that loads CIROH project 26-120 into the board.

Sources, all read from Documents/ in the CIROH_FF folder:
  CIROH_26-120_RACI_Matrix.xlsx            people, the 50 tasks, every RACI letter
  CIROH_26-120_Timeline_Sep2026_Jan2027    the compressed schedule and milestones
  CIROH Research Plan FY26 26-120.docx     objectives
  HV QPF Biases FY26 White Paper_VF.docx   problem statement
  Project Monitoring Plan.docx             inputs, reporting, measurable objectives
"""
import re

OUT = "/home/claude/gen/load_26120.sql"

def q(s):
    """Single-quote a value for SQL, or NULL."""
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"

# --------------------------------------------------------------- the team
# short name used in the RACI columns -> (display name, role, email)
PEOPLE = [
    ("Vergara (PI)",  "Humberto Vergara", "PI, University of Iowa. Coordination, NPET, reports", None),
    ("Abdelkader",    "Mohamed Abdelkader", "Research Scientist, UI. TITO for NextGen, modules, evaluation lead", None),
    ("Green",         "Matthew Green", "Subaward lead, CU Boulder CIRES at NOAA WPC. AnaPrO, QPF error prognostics", "matthew.green-1@colorado.edu"),
    ("Thielke",       "Timothy Thielke", "Research Associate, CU Boulder CIRES at NOAA WPC. Downscaling, data assembly", "timothy.thielke@colorado.edu"),
    ("GRA 1",         "GRA 1", "PhD student, UI. NextGen and NPET, hydrologic experiments", None),
    ("GRA 2",         "GRA 2", "PhD student, UI. QPF ensembles, ATRACKCS", None),
    ("UI co-Is",      "UI co-investigators", "Derin, Bradley, Krajewski, Quintero, Molina. Consulted", None),
    ("NOAA partners", "NOAA partners", "WPC (Novak, Nelson), NCRFC, WFO Des Moines and Quad Cities. Informed", None),
]
# Named co-investigators who need their own login, in addition to the group seat.
EXTRA_PEOPLE = [
    ("Allen Bradley",   "Co-investigator, UI. Data fusion, Task 1.3", "allen-bradley@uiowa.edu"),
    ("Felipe Quintero", "Co-investigator, UI. NextGen pre-processing, student supervision", "felipe-quintero@uiowa.edu"),
]

GROUPS = [
    ("1.0", "Project setup and coordination"),
    ("2.0", "Case selection and datasets"),
    ("3.0", "NGIAB and TITO for NextGen"),
    ("4.0", "Objective 1, QPF post-processing"),
    ("5.0", "Objective 2, NextGen-compatible procedures"),
    ("6.0", "Objective 3, evaluation of strategies"),
    ("7.0", "Reporting, dissemination and closeout"),
]

# wbs, title, start, end. Windows come from the timeline spreadsheet: each child
# sits inside the window of the proposal task it belongs to.
TASKS = [
    ("1.1",  "Kickoff meeting: roles (RACI), weekly meeting slot, GRA assignments", "2026-09-07", "2026-09-18"),
    ("1.2",  "Data access with CU Boulder (AnaPrO products, MTD object files, HRRR inputs)", "2026-09-07", "2026-09-25"),
    ("1.3",  "Confirm the AnaPrO product definition (threshold, analog conditioning, lead times)", "2026-09-14", "2026-09-30"),
    ("1.4",  "Shared repositories (GitHub, HydroShare resource, data storage)", "2026-09-07", "2026-09-18"),
    ("1.5",  "NextGen model configuration decision (CFE with Noah-OWP-Modular now, BMI HLM when available)", "2026-09-14", "2026-09-25"),
    ("1.6",  "GitHub project board and sprint planning", "2026-09-14", "2026-09-25"),
    ("1.7",  "Weekly team meeting, Gantt and risk register update", "2026-09-07", "2027-01-29"),

    ("2.1",  "Case selection criteria and case list (Task 3.1)", "2026-09-07", "2026-09-18"),
    ("2.2",  "NW Iowa June 2024 case: Little Sioux domain, MRMS warmup, HRRR cycles, USGS data", "2026-09-14", "2026-10-02"),
    ("2.3",  "AnaPrO June 2024 archive provided and decoded", "2026-09-14", "2026-09-30"),
    ("2.4",  "Texas 2025, Kentucky 2022 and Ellicott City 2018 cases: domains, HRRR, MRMS, AnaPrO, gages", "2026-09-28", "2026-10-16"),
    ("2.7",  "Flood impact documentation and USGS records for every case", "2026-10-05", "2026-10-16"),
    ("2.8",  "Dataset catalog with README and provenance (M1)", "2026-10-05", "2026-10-16"),

    ("3.1",  "NGIAB installed and TITO v0.1.0 (forcing threading, run builder, interface)", "2026-09-07", "2026-10-02"),
    ("3.3",  "Sub-hourly NGIAB images (15 and 5 minute)", "2026-09-21", "2026-10-16"),
    ("3.4",  "TITO v0.2.0, runbook and interface screenshots", "2026-10-05", "2026-11-13"),
    ("3.6",  "Resolve the 15 vs 5 minute peak discrepancy", "2026-10-19", "2026-11-06"),
    ("3.7",  "Calibrate the Little Sioux domain", "2026-10-19", "2026-11-13"),
    ("3.8",  "Argon HPC run path (Apptainer) for large hindcasts", "2026-11-02", "2026-11-27"),
    ("3.9",  "TITO v0.3: ensemble run manager, post-processor hook, NPET section", "2026-11-16", "2026-12-18"),
    ("3.10", "TITO documentation and open source packaging", "2027-01-04", "2027-01-22"),

    ("4.1",  "Displacement sampling from AnaPrO in TITO (first version, Task 1.1)", "2026-09-14", "2026-10-09"),
    ("4.2",  "Historical HRRR and MRMS pairs for intensity error calibration (Task 1.1)", "2026-09-14", "2026-10-16"),
    ("4.3",  "CSGD fit and Gaussian copula perturbations (Task 1.1)", "2026-09-28", "2026-10-30"),
    ("4.5",  "AnaPrO and StormLab post-processor packaged, deterministic and ensemble QPF (Task 1.1)", "2026-10-12", "2026-11-06"),
    ("4.6",  "Downscaling of QPF error statistics to high resolution (Task 1.1, CU Boulder)", "2026-10-05", "2026-11-06"),
    ("4.7",  "ATRACKCS tracking, nowcast trajectories, short-term error features (Task 1.2)", "2026-09-21", "2026-11-13"),
    ("4.10", "HRRR QPFs post-processed with the short-term characterization (Task 1.2)", "2026-10-19", "2026-11-13"),
    ("4.11", "Bayesian fusion design and implementation (Task 1.3)", "2026-11-02", "2026-12-11"),
    ("4.13", "M2: error-correction procedure for HRRR QPFs working end to end", "2026-12-07", "2026-12-11"),

    ("5.1",  "Pre-processing module for rainfall forcings into the Forcing Engine (Task 2.1)", "2026-09-28", "2026-10-30"),
    ("5.2",  "Python controller for iterative NextGen execution (Task 2.1)", "2026-10-12", "2026-11-13"),
    ("5.3",  "Module connected to the post-processor, documentation and tests (Task 2.1)", "2026-11-02", "2026-12-04"),
    ("5.5",  "NPET review, adaptation to NextGen outputs, AnaPrO weighting (Task 2.2)", "2026-10-12", "2026-12-11"),
    ("5.8",  "BMI compliance review of the pre and post-processing modules", "2026-11-16", "2026-12-11"),
    ("5.9",  "M3: prototype modules and NextGen workflow delivered", "2026-12-14", "2026-12-18"),

    ("6.1",  "First hourly cycle for June 2024 with all strategies (Task 3.1)", "2026-10-19", "2026-11-06"),
    ("6.2",  "Hourly 24 cycle and 15 minute hindcasts for June 2024 (Task 3.1)", "2026-11-02", "2026-11-27"),
    ("6.4",  "Hindcasts for the other cases and NPET ensemble hindcasts (Task 3.1)", "2026-11-16", "2026-12-18"),
    ("6.6",  "Rainfall to rainfall comparison against MRMS (Task 3.2)", "2026-11-16", "2026-12-11"),
    ("6.7",  "Hydrologic verification and computational cost per strategy (Task 3.2)", "2026-11-30", "2027-01-08"),
    ("6.9",  "Comparative assessment report and figures (Task 3.2, M4)", "2027-01-04", "2027-01-15"),

    ("7.1",  "Project update at the CIROH Science Meeting 2026 (lightning talk)", "2026-10-19", "2026-10-30"),
    ("7.2",  "Monthly HydroShare reports and quarterly Smartsheet report", "2026-09-07", "2027-01-29"),
    ("7.6",  "Mentoring of the two GRAs", "2026-09-07", "2027-01-29"),
    ("7.7",  "HydroLearn module on QPF uncertainty and storm tracking", "2026-12-07", "2027-01-22"),
    ("7.8",  "Manuscript draft (Journal of Hydrometeorology or Journal of Hydrology)", "2027-01-04", "2027-01-29"),
    ("7.9",  "Conference abstracts and talks (AMS 2027, AGU, CIROH Developers Conference, R2O webinar)", "2026-11-02", "2027-01-29"),
    ("7.10", "Code and data release (GitHub, HydroShare, TRL documentation)", "2027-01-11", "2027-01-29"),
    ("7.11", "Final project report and closeout (M5)", "2027-01-18", "2027-01-29"),
]

# The RACI letters, read cell by cell from the RACI sheet. Column order is
# PEOPLE's short names, verified against the sheet header. A dash is an empty
# cell. These are transcribed, not inferred.
RACI = {
    "1.1": "A R C I I I I -",
    "1.2": "A C R R I I - -",
    "1.3": "I R A C - I - -",
    "1.4": "A R I I I I - -",
    "1.5": "A R I - I - C -",
    "1.6": "A R I - C C - -",
    "1.7": "A R C I C C I -",
    "2.1": "A R C I I I C -",
    "2.2": "A R C - I - - -",
    "2.3": "I R A R - I - -",
    "2.4": "I A R I R I - -",
    "2.7": "I A I - R - - -",
    "2.8": "I A I I R C - -",
    "3.1": "A R - - I - C -",
    "3.3": "A R - - I - I -",
    "3.4": "A R I - I I - -",
    "3.6": "I A - - R - C -",
    "3.7": "I A - - R - C -",
    "3.8": "I A - - R - - -",
    "3.9": "I A - - R C C -",
    "3.10": "A R I - R - I -",
    "4.1": "A R C - - I - -",
    "4.2": "A I C R - R C -",
    "4.3": "A C C - - R C -",
    "4.5": "A C C I I R C -",
    "4.6": "I I A R - C - -",
    "4.7": "A I C - - R I -",
    "4.10": "A C I - - R - -",
    "4.11": "A I I - - R C -",
    "4.13": "A C C I I R I I",
    "5.1": "I A - - R C C -",
    "5.2": "I A - - R - C -",
    "5.3": "I A I - R R - -",
    "5.5": "A C C - R I C -",
    "5.8": "A C - - C - R -",
    "5.9": "A R I - R I I I",
    "6.1": "A R I - I - - -",
    "6.2": "I A I - R I - -",
    "6.4": "I A C - R I - -",
    "6.6": "I A C - - R C -",
    "6.7": "I A C - R - C I",
    "6.9": "A R C I R R C I",
    "7.1": "A R I - - - I -",
    "7.2": "A R R I R R I I",
    "7.6": "A C - - I I R -",
    "7.7": "A C I - - R R -",
    "7.8": "A R R C R R C -",
    "7.9": "A R R - C C I I",
    "7.10": "A R C - R R I I",
    "7.11": "A R R C C C C I",
}

MILESTONES = [
    ("M1", "Cases selected and datasets collected", "2026-10-16", "Abdelkader"),
    ("M2", "Error-correction procedure for HRRR QPFs working end to end", "2026-12-11", "GRA 2"),
    ("M3", "Prototype modules and NextGen workflow delivered", "2026-12-18", "Abdelkader"),
    ("M4", "Evaluation of error-correction strategies for the selected cases", "2027-01-15", "Abdelkader"),
    ("M5", "Final report, manuscript draft and code release", "2027-01-29", "Vergara (PI)"),
    ("P1", "Monthly progress report to OWP (September)", "2026-09-30", "Vergara (PI)"),
    ("P2", "Monthly progress report to OWP (October)", "2026-10-30", "Vergara (PI)"),
    ("P3", "Monthly progress report to OWP (November)", "2026-11-30", "Vergara (PI)"),
    ("P4", "Quarterly report via CIROH Smartsheet, plus December monthly", "2026-12-18", "Vergara (PI)"),
    ("P5", "Monthly progress report (January) and closeout", "2027-01-29", "Vergara (PI)"),
]

# Drafted from the assumptions and dependencies, since the proposal has no risk
# register of its own. Scored 1 to 5 for likelihood and consequence.
RISKS = [
    ("1.0", "The five month window leaves no slack for any task to slip",
     "Later objectives compress or are dropped, and there is no no-cost extension to absorb it",
     4, 5, "Front load the software so Tasks 2.1, 3.1 and 3.2 share one orchestrator. Review the Gantt weekly and move scope rather than dates.",
     "Vergara (PI)"),
    ("2.0", "AnaPrO and MTD object data for cases other than June 2024 arrive late from CU Boulder",
     "Task 1.1 stalls, and with it every hindcast that depends on corrected QPF",
     3, 4, "The June 2024 archive is already in hand, so development proceeds on it while the rest is requested early.",
     "Green"),
    ("3.0", "Archived HRRR or MRMS coverage proves incomplete for a selected case",
     "That case drops out and the comparison rests on fewer events",
     3, 3, "Case selection is driven by archive availability, and more cases are listed than are strictly needed.",
     "Thielke"),
    ("4.0", "Sub-hourly NextGen runs on the full case set exceed the compute available",
     "Hindcasts are reduced to hourly, weakening the sub-hourly argument",
     3, 3, "Argon HPC path via Apptainer prepared early. Stage runs by case and clear intermediates.",
     "Abdelkader"),
    ("5.0", "Graduate research assistant availability over the semester falls short of 75 percent",
     "Objective 1 and the evaluation both slow, since the GRAs carry them",
     3, 4, "Weekly meetings surface it early. Mentoring time is scheduled rather than assumed.",
     "Felipe Quintero"),
]

OVERVIEW = {
    "name": "Integrating precipitation forecast errors into NextGen for improved flood forecasting",
    "code": "26-120",
    "summary": "Turn WPC rainstorm forecast error products into corrected and ensemble rainfall for NextGen, then measure whether flood forecasts actually improve.",
    "start_date": "2026-09-07",
    "end_date": "2027-01-31",
    "problem_statement": """Errors in operational short range quantitative precipitation forecasts are large enough to change a flood decision. Storm location errors run on the order of 100 km, and they vary considerably by region and by season.

Used deterministically in a hydrologic forecast, a QPF can look precise in location, timing, magnitude and structure while still putting the rain on the wrong surface flow paths. The result misleads situational awareness rather than informing it.

Convection allowing models now come with products that characterise this uncertainty, but that error information does not reach the hydrologic side. Nothing in the NextGen forcing path carries it, so forecasters get a single rainfall field with no indication of how wrong it might be or in which direction.""",
    "objectives": """RO1. Implement a QPF post-processing method that propagates predicted rainstorm forecast errors into uncertainty estimates. Use the Analog Forecasting of Precipitation Objects (AnaPrO) as a data driven prior on storm location error, embedded in a StormLab style framework, to produce both an error corrected deterministic field and an ensemble QPF representing the short range error modes.

RO2. Design NextGen compatible procedures for assimilating that error information. Build tools that couple to the Forcing Engine and the Model Engine: a stand alone Python pre-processing module for rainfall forcings, and an NPET based post-processing routine for deterministic streamflow output.

RO3. Evaluate the skill and the computational cost of deterministic and ensemble approaches. Compare four strategies: unadjusted HRRR QPF, error corrected deterministic HRRR QPF, the prognostic error ensemble, and NPET ensembles from assimilated error information. Assess both forecast skill and the compute each approach demands, so the benefit can be weighed against the cost.""",
    "assumptions": """The nine month proposal period is compressed into five months, 7 September 2026 to 31 January 2027, because funding arrived late. There is no no-cost extension, so the work has to finish inside that window.

Task order follows the submitted proposal Gantt. Only the calendar changed, not the sequence.

Effort is 3.0 person months for Abdelkader plus two graduate research assistants at 75 percent.

AnaPrO products, the archived HRRR QPF and MRMS radar QPE are all available for the events selected as case studies. Case selection is driven by that availability.

High performance computing at the University of Iowa is available for the hindcast runs.

NextGen work already done with Summer Institute students, including NCET preprocessing, the 15 minute NGIAB Docker build and the spatiotemporal sensitivity work, is reusable here.

Early effort is deliberately front loaded into software, because the experiments cannot run until the orchestration exists.

Reporting is monthly to the NOAA OWP points of contact through HydroShare, and quarterly through the CIROH Smartsheet system.""",
    "dependencies": """From outside the project:
AnaPrO and MTD products from CIRES at CU Boulder, via Matthew Green's subaward. Task 1.1 cannot start without them.
Archived HRRR QPF, for calibrating rainfall intensity errors against radar.
MRMS radar precipitation estimates, used both for calibration and as the reference for verification.
Historical flash flood records and streamflow observations for the selected events.
University of Iowa high performance computing, including the Argon cluster for the larger hindcasts.
Docker Desktop with the NGIAB image, which TITO builds run directories for.

Inside the project:
Task 1.2 needs the procedure devised in Task 1.1.
Task 1.3 needs both 1.1 and 1.2, since it fuses the long term and short term characterisations.
Task 2.1 needs TITO v0.1 and the Task 1.1 outputs.
Task 2.2 needs Task 2.1 and the NCET section of TITO.
Task 3.2 needs every hindcast finished, so it is the last thing to move.""",
}


def build():
    L = []
    w = L.append

    w("-- " + "=" * 74)
    w("-- CIROH project 26-120, loaded into the project board.")
    w("--")
    w("-- Built from CIROH_26-120_RACI_Matrix.xlsx (people, 50 tasks, every RACI")
    w("-- letter), CIROH_26-120_Timeline_Sep2026_Jan2027.xlsx (schedule and")
    w("-- milestones), the FY26 Research Plan, the QPF Biases white paper and the")
    w("-- Project Monitoring Plan.")
    w("--")
    w("-- Safe to run more than once: it clears this project's tasks, milestones")
    w("-- and risks first, then reloads them. Progress reports on the Activity tab")
    w("-- are never touched.")
    w("--")
    w("-- Every task starts at 0 percent and Not started.")
    w("-- " + "=" * 74)
    w("")
    w("do $$")
    w("declare")
    w("  pid uuid;")
    w("  gid uuid;")
    w("  tid uuid;")
    w("  owner_id uuid;")
    for short, *_ in PEOPLE:
        w(f"  m_{slug(short)} uuid;")
    for name, *_ in EXTRA_PEOPLE:
        w(f"  m_{slug(name)} uuid;")
    w("begin")
    w("")
    w("  -- ---------------------------------------------------------- the project")
    w("  select id into pid from projects")
    w("   where code in ('26-120','FY26-120') or name ilike '%QPF%'")
    w("   order by created_at limit 1;")
    w("")
    w("  if pid is null then")
    w("    raise exception 'No project found with code 26-120 or FY26-120, or a name containing QPF. Open the board, check the project name, and tell Claude.';")
    w("  end if;")
    w("")
    w("  update projects set")
    for k in ("name", "code", "summary", "problem_statement", "objectives", "assumptions", "dependencies"):
        w(f"    {k} = {q(OVERVIEW[k])},")
    w(f"    start_date = {q(OVERVIEW['start_date'])}::date,")
    w(f"    end_date   = {q(OVERVIEW['end_date'])}::date,")
    w("    status     = 'active'")
    w("  where id = pid;")
    w("")
    w("  -- ------------------------------------------------------------- the team")
    w("  -- Mohamed already has an admin seat from creating the project; it is")
    w("  -- reused rather than duplicated.")
    w("  select id into m_abdelkader from project_members")
    w("   where project_id = pid and is_admin order by created_at limit 1;")
    w("")
    w("  if m_abdelkader is not null then")
    w("    update project_members")
    w(f"       set display_name = {q('Mohamed Abdelkader')}, role = {q('Research Scientist, UI. TITO for NextGen, modules, evaluation lead')}")
    w("     where id = m_abdelkader;")
    w("  end if;")
    w("")

    for short, display, role, email in PEOPLE:
        if short == "Abdelkader":
            continue
        v = f"m_{slug(short)}"
        w(f"  select id into {v} from project_members")
        w(f"   where project_id = pid and display_name = {q(display)} limit 1;")
        w(f"  if {v} is null then")
        w(f"    insert into project_members (project_id, display_name, role, invited_email)")
        w(f"    values (pid, {q(display)}, {q(role)}, {q(email)}) returning id into {v};")
        w(f"  else")
        w(f"    update project_members set role = {q(role)}, invited_email = coalesce(invited_email, {q(email)}) where id = {v};")
        w(f"  end if;")
        w("")

    for display, role, email in EXTRA_PEOPLE:
        v = f"m_{slug(display)}"
        w(f"  select id into {v} from project_members")
        w(f"   where project_id = pid and display_name = {q(display)} limit 1;")
        w(f"  if {v} is null then")
        w(f"    insert into project_members (project_id, display_name, role, invited_email)")
        w(f"    values (pid, {q(display)}, {q(role)}, {q(email)}) returning id into {v};")
        w(f"  else")
        w(f"    update project_members set role = {q(role)}, invited_email = coalesce(invited_email, {q(email)}) where id = {v};")
        w(f"  end if;")
        w("")

    w("  -- ------------------------------------- clear and reload the task list")
    w("  -- Deleting a task removes its RACI cells too, by cascade.")
    w("  delete from tasks      where project_id = pid;")
    w("  delete from milestones where project_id = pid;")
    w("  delete from risks      where project_id = pid;")
    w("")

    order = 0
    for gwbs, gtitle in GROUPS:
        order += 1000
        w(f"  -- {gwbs} {gtitle}")
        w("  insert into tasks (project_id, wbs, title, is_summary, sort_order)")
        w(f"  values (pid, {q(gwbs)}, {q(gtitle)}, true, {order}) returning id into gid;")
        w("")
        major = gwbs.split(".")[0]
        sub = 0
        for wbs, title, start, end in TASKS:
            if wbs.split(".")[0] != major:
                continue
            sub += 1
            letters = RACI.get(wbs, "").split()
            owner_short = pick_owner(letters)
            ovar = f"m_{slug(owner_short)}" if owner_short else "null"
            w(f"  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,")
            w(f"                     owner_id, sort_order, pct_complete, status)")
            w(f"  values (pid, gid, {q(wbs)}, {q(title)}, {q(start)}::date, {q(end)}::date,")
            w(f"          {ovar}, {order + sub}, 0, 'not_started') returning id into tid;")
            if letters:
                pairs = []
                for (short, *_), letter in zip(PEOPLE, letters):
                    if letter in ("R", "A", "C", "I"):
                        pairs.append((short, letter))
                if pairs:
                    w("  insert into raci_assignments (task_id, member_id, letter) values")
                    rows = [f"    (tid, m_{slug(s)}, {q(l)})" for s, l in pairs]
                    w(",\n".join(rows) + ";")
            w("")

    w("  -- ---------------------------------------------------------- milestones")
    msort = 0
    for num, title, due, owner_short in MILESTONES:
        msort += 1000
        ovar = f"m_{slug(owner_short)}"
        w("  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)")
        w(f"  values (pid, {q(num)}, {q(title)}, {q(due)}::date, {ovar}, {msort});")
    w("")

    w("  -- --------------------------------------------------------- risk register")
    rsort = 0
    for rno, desc, conseq, lik, sev, mit, owner_short in RISKS:
        rsort += 1000
        ovar = f"m_{slug(owner_short)}"
        w("  insert into risks (project_id, risk_no, description, consequence, likelihood,")
        w("                     severity, mitigation, owner_id, status, sort_order)")
        w(f"  values (pid, {q(rno)}, {q(desc)}, {q(conseq)}, {lik}, {sev},")
        w(f"          {q(mit)}, {ovar}, 'open', {rsort});")
    w("")

    w("  raise notice 'Loaded project 26-120: % tasks, % milestones, % risks.',")
    w("    (select count(*) from tasks where project_id = pid and not is_summary),")
    w("    (select count(*) from milestones where project_id = pid),")
    w("    (select count(*) from risks where project_id = pid);")
    w("end $$;")
    w("")
    w("-- What landed, so you can check it without leaving the editor.")
    w("select 'tasks'      as what, count(*) from tasks      where project_id = (select id from projects where code = '26-120')")
    w("union all select 'groups',    count(*) from tasks      where project_id = (select id from projects where code = '26-120') and is_summary")
    w("union all select 'raci cells',count(*) from raci_assignments r join tasks t on t.id = r.task_id where t.project_id = (select id from projects where code = '26-120')")
    w("union all select 'members',   count(*) from project_members where project_id = (select id from projects where code = '26-120')")
    w("union all select 'milestones',count(*) from milestones where project_id = (select id from projects where code = '26-120')")
    w("union all select 'risks',     count(*) from risks      where project_id = (select id from projects where code = '26-120');")
    return "\n".join(L) + "\n"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def pick_owner(letters):
    """The owner is whoever does the work: the first R, else the accountable A."""
    shorts = [p[0] for p in PEOPLE]
    for want in ("R", "A"):
        for short, letter in zip(shorts, letters):
            if letter == want:
                return short
    return None


def check_owners():
    declared = {slug(p[0]) for p in PEOPLE} | {slug(e[0]) for e in EXTRA_PEOPLE}
    bad = []
    for num, title, due, owner in MILESTONES:
        if slug(owner) not in declared:
            bad.append(f"milestone {num}: {owner!r}")
    for rno, *_rest in RISKS:
        owner = _rest[-1]
        if slug(owner) not in declared:
            bad.append(f"risk {rno}: {owner!r}")
    for wbs, letters in RACI.items():
        parts = letters.split()
        if len(parts) != len(PEOPLE):
            bad.append(f"task {wbs}: {len(parts)} letters for {len(PEOPLE)} people")
        for c in parts:
            if c not in ("R", "A", "C", "I", "-"):
                bad.append(f"task {wbs}: bad letter {c!r}")
    if bad:
        raise SystemExit("owner and letter check failed:\n  " + "\n  ".join(bad))
    print(f"owner and letter check passed ({len(declared)} people declared)")


if __name__ == "__main__":
    check_owners()
    sql = build()
    open(OUT, "w").write(sql)
    print(f"wrote {OUT}  ({len(sql)} bytes, {sql.count(chr(10))} lines)")
    print(f"tasks: {len(TASKS)}  groups: {len(GROUPS)}  raci rows: {len(RACI)}")
    print(f"milestones: {len(MILESTONES)}  risks: {len(RISKS)}  people: {len(PEOPLE) + len(EXTRA_PEOPLE)}")
    missing = [t[0] for t in TASKS if t[0] not in RACI]
    if missing:
        print("TASKS WITH NO RACI ROW:", missing)
    extra = [k for k in RACI if k not in [t[0] for t in TASKS]]
    if extra:
        print("RACI ROWS WITH NO TASK:", extra)
