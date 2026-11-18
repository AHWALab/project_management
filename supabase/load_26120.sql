-- ==========================================================================
-- CIROH project 26-120, loaded into the project board.
--
-- Built from CIROH_26-120_RACI_Matrix.xlsx (people, 50 tasks, every RACI
-- letter), CIROH_26-120_Timeline_Sep2026_Jan2027.xlsx (schedule and
-- milestones), the FY26 Research Plan, the QPF Biases white paper and the
-- Project Monitoring Plan.
--
-- Safe to run more than once: it clears this project's tasks, milestones
-- and risks first, then reloads them. Progress reports on the Activity tab
-- are never touched.
--
-- Every task starts at 0 percent and Not started.
-- ==========================================================================

do $$
declare
  pid uuid;
  gid uuid;
  tid uuid;
  owner_id uuid;
  m_vergara_pi uuid;
  m_abdelkader uuid;
  m_green uuid;
  m_thielke uuid;
  m_gra_1 uuid;
  m_gra_2 uuid;
  m_ui_co_is uuid;
  m_noaa_partners uuid;
  m_allen_bradley uuid;
  m_felipe_quintero uuid;
begin

  -- ---------------------------------------------------------- the project
  select id into pid from projects
   where code in ('26-120','FY26-120') or name ilike '%QPF%'
   order by created_at limit 1;

  if pid is null then
    raise exception 'No project found with code 26-120 or FY26-120, or a name containing QPF. Open the board, check the project name, and tell Claude.';
  end if;

  update projects set
    name = 'Integrating precipitation forecast errors into NextGen for improved flood forecasting',
    code = '26-120',
    summary = 'Turn WPC rainstorm forecast error products into corrected and ensemble rainfall for NextGen, then measure whether flood forecasts actually improve.',
    problem_statement = 'Errors in operational short range quantitative precipitation forecasts are large enough to change a flood decision. Storm location errors run on the order of 100 km, and they vary considerably by region and by season.

Used deterministically in a hydrologic forecast, a QPF can look precise in location, timing, magnitude and structure while still putting the rain on the wrong surface flow paths. The result misleads situational awareness rather than informing it.

Convection allowing models now come with products that characterise this uncertainty, but that error information does not reach the hydrologic side. Nothing in the NextGen forcing path carries it, so forecasters get a single rainfall field with no indication of how wrong it might be or in which direction.',
    objectives = 'RO1. Implement a QPF post-processing method that propagates predicted rainstorm forecast errors into uncertainty estimates. Use the Analog Forecasting of Precipitation Objects (AnaPrO) as a data driven prior on storm location error, embedded in a StormLab style framework, to produce both an error corrected deterministic field and an ensemble QPF representing the short range error modes.

RO2. Design NextGen compatible procedures for assimilating that error information. Build tools that couple to the Forcing Engine and the Model Engine: a stand alone Python pre-processing module for rainfall forcings, and an NPET based post-processing routine for deterministic streamflow output.

RO3. Evaluate the skill and the computational cost of deterministic and ensemble approaches. Compare four strategies: unadjusted HRRR QPF, error corrected deterministic HRRR QPF, the prognostic error ensemble, and NPET ensembles from assimilated error information. Assess both forecast skill and the compute each approach demands, so the benefit can be weighed against the cost.',
    assumptions = 'The nine month proposal period is compressed into five months, 7 September 2026 to 31 January 2027, because funding arrived late. There is no no-cost extension, so the work has to finish inside that window.

Task order follows the submitted proposal Gantt. Only the calendar changed, not the sequence.

Effort is 3.0 person months for Abdelkader plus two graduate research assistants at 75 percent.

AnaPrO products, the archived HRRR QPF and MRMS radar QPE are all available for the events selected as case studies. Case selection is driven by that availability.

High performance computing at the University of Iowa is available for the hindcast runs.

NextGen work already done with Summer Institute students, including NCET preprocessing, the 15 minute NGIAB Docker build and the spatiotemporal sensitivity work, is reusable here.

Early effort is deliberately front loaded into software, because the experiments cannot run until the orchestration exists.

Reporting is monthly to the NOAA OWP points of contact through HydroShare, and quarterly through the CIROH Smartsheet system.',
    dependencies = 'From outside the project:
AnaPrO and MTD products from CIRES at CU Boulder, via Matthew Green''s subaward. Task 1.1 cannot start without them.
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
Task 3.2 needs every hindcast finished, so it is the last thing to move.',
    start_date = '2026-09-07'::date,
    end_date   = '2027-01-31'::date,
    status     = 'active'
  where id = pid;

  -- ------------------------------------------------------------- the team
  -- Mohamed already has an admin seat from creating the project; it is
  -- reused rather than duplicated.
  select id into m_abdelkader from project_members
   where project_id = pid and is_admin order by created_at limit 1;

  if m_abdelkader is not null then
    update project_members
       set display_name = 'Mohamed Abdelkader', role = 'Research Scientist, UI. TITO for NextGen, modules, evaluation lead'
     where id = m_abdelkader;
  end if;

  select id into m_vergara_pi from project_members
   where project_id = pid and display_name = 'Humberto Vergara' limit 1;
  if m_vergara_pi is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'Humberto Vergara', 'PI, University of Iowa. Coordination, NPET, reports', null) returning id into m_vergara_pi;
  else
    update project_members set role = 'PI, University of Iowa. Coordination, NPET, reports', invited_email = coalesce(invited_email, null) where id = m_vergara_pi;
  end if;

  select id into m_green from project_members
   where project_id = pid and display_name = 'Matthew Green' limit 1;
  if m_green is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'Matthew Green', 'Subaward lead, CU Boulder CIRES at NOAA WPC. AnaPrO, QPF error prognostics', 'matthew.green-1@colorado.edu') returning id into m_green;
  else
    update project_members set role = 'Subaward lead, CU Boulder CIRES at NOAA WPC. AnaPrO, QPF error prognostics', invited_email = coalesce(invited_email, 'matthew.green-1@colorado.edu') where id = m_green;
  end if;

  select id into m_thielke from project_members
   where project_id = pid and display_name = 'Timothy Thielke' limit 1;
  if m_thielke is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'Timothy Thielke', 'Research Associate, CU Boulder CIRES at NOAA WPC. Downscaling, data assembly', 'timothy.thielke@colorado.edu') returning id into m_thielke;
  else
    update project_members set role = 'Research Associate, CU Boulder CIRES at NOAA WPC. Downscaling, data assembly', invited_email = coalesce(invited_email, 'timothy.thielke@colorado.edu') where id = m_thielke;
  end if;

  select id into m_gra_1 from project_members
   where project_id = pid and display_name = 'GRA 1' limit 1;
  if m_gra_1 is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'GRA 1', 'PhD student, UI. NextGen and NPET, hydrologic experiments', null) returning id into m_gra_1;
  else
    update project_members set role = 'PhD student, UI. NextGen and NPET, hydrologic experiments', invited_email = coalesce(invited_email, null) where id = m_gra_1;
  end if;

  select id into m_gra_2 from project_members
   where project_id = pid and display_name = 'GRA 2' limit 1;
  if m_gra_2 is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'GRA 2', 'PhD student, UI. QPF ensembles, ATRACKCS', null) returning id into m_gra_2;
  else
    update project_members set role = 'PhD student, UI. QPF ensembles, ATRACKCS', invited_email = coalesce(invited_email, null) where id = m_gra_2;
  end if;

  select id into m_ui_co_is from project_members
   where project_id = pid and display_name = 'UI co-investigators' limit 1;
  if m_ui_co_is is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'UI co-investigators', 'Derin, Bradley, Krajewski, Quintero, Molina. Consulted', null) returning id into m_ui_co_is;
  else
    update project_members set role = 'Derin, Bradley, Krajewski, Quintero, Molina. Consulted', invited_email = coalesce(invited_email, null) where id = m_ui_co_is;
  end if;

  select id into m_noaa_partners from project_members
   where project_id = pid and display_name = 'NOAA partners' limit 1;
  if m_noaa_partners is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'NOAA partners', 'WPC (Novak, Nelson), NCRFC, WFO Des Moines and Quad Cities. Informed', null) returning id into m_noaa_partners;
  else
    update project_members set role = 'WPC (Novak, Nelson), NCRFC, WFO Des Moines and Quad Cities. Informed', invited_email = coalesce(invited_email, null) where id = m_noaa_partners;
  end if;

  select id into m_allen_bradley from project_members
   where project_id = pid and display_name = 'Allen Bradley' limit 1;
  if m_allen_bradley is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'Allen Bradley', 'Co-investigator, UI. Data fusion, Task 1.3', 'allen-bradley@uiowa.edu') returning id into m_allen_bradley;
  else
    update project_members set role = 'Co-investigator, UI. Data fusion, Task 1.3', invited_email = coalesce(invited_email, 'allen-bradley@uiowa.edu') where id = m_allen_bradley;
  end if;

  select id into m_felipe_quintero from project_members
   where project_id = pid and display_name = 'Felipe Quintero' limit 1;
  if m_felipe_quintero is null then
    insert into project_members (project_id, display_name, role, invited_email)
    values (pid, 'Felipe Quintero', 'Co-investigator, UI. NextGen pre-processing, student supervision', 'felipe-quintero@uiowa.edu') returning id into m_felipe_quintero;
  else
    update project_members set role = 'Co-investigator, UI. NextGen pre-processing, student supervision', invited_email = coalesce(invited_email, 'felipe-quintero@uiowa.edu') where id = m_felipe_quintero;
  end if;

  -- ------------------------------------- clear and reload the task list
  -- Deleting a task removes its RACI cells too, by cascade.
  delete from tasks      where project_id = pid;
  delete from milestones where project_id = pid;
  delete from risks      where project_id = pid;

  -- 1.0 Project setup and coordination
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '1.0', 'Project setup and coordination', true, 1000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.1', 'Kickoff meeting: roles (RACI), weekly meeting slot, GRA assignments', '2026-09-07'::date, '2026-09-18'::date,
          m_abdelkader, 1001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I'),
    (tid, m_ui_co_is, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.2', 'Data access with CU Boulder (AnaPrO products, MTD object files, HRRR inputs)', '2026-09-07'::date, '2026-09-25'::date,
          m_green, 1002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'R'),
    (tid, m_thielke, 'R'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.3', 'Confirm the AnaPrO product definition (threshold, analog conditioning, lead times)', '2026-09-14'::date, '2026-09-30'::date,
          m_abdelkader, 1003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'A'),
    (tid, m_thielke, 'C'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.4', 'Shared repositories (GitHub, HydroShare resource, data storage)', '2026-09-07'::date, '2026-09-18'::date,
          m_abdelkader, 1004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.5', 'NextGen model configuration decision (CFE with Noah-OWP-Modular now, BMI HLM when available)', '2026-09-14'::date, '2026-09-25'::date,
          m_abdelkader, 1005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.6', 'GitHub project board and sprint planning', '2026-09-14'::date, '2026-09-25'::date,
          m_abdelkader, 1006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'C'),
    (tid, m_gra_2, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '1.7', 'Weekly team meeting, Gantt and risk register update', '2026-09-07'::date, '2027-01-29'::date,
          m_abdelkader, 1007, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'C'),
    (tid, m_gra_2, 'C'),
    (tid, m_ui_co_is, 'I');

  -- 2.0 Case selection and datasets
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '2.0', 'Case selection and datasets', true, 2000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.1', 'Case selection criteria and case list (Task 3.1)', '2026-09-07'::date, '2026-09-18'::date,
          m_abdelkader, 2001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.2', 'NW Iowa June 2024 case: Little Sioux domain, MRMS warmup, HRRR cycles, USGS data', '2026-09-14'::date, '2026-10-02'::date,
          m_abdelkader, 2002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_gra_1, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.3', 'AnaPrO June 2024 archive provided and decoded', '2026-09-14'::date, '2026-09-30'::date,
          m_abdelkader, 2003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'A'),
    (tid, m_thielke, 'R'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.4', 'Texas 2025, Kentucky 2022 and Ellicott City 2018 cases: domains, HRRR, MRMS, AnaPrO, gages', '2026-09-28'::date, '2026-10-16'::date,
          m_green, 2004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'R'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.7', 'Flood impact documentation and USGS records for every case', '2026-10-05'::date, '2026-10-16'::date,
          m_gra_1, 2005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '2.8', 'Dataset catalog with README and provenance (M1)', '2026-10-05'::date, '2026-10-16'::date,
          m_gra_1, 2006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'I'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'C');

  -- 3.0 NGIAB and TITO for NextGen
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '3.0', 'NGIAB and TITO for NextGen', true, 3000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.1', 'NGIAB installed and TITO v0.1.0 (forcing threading, run builder, interface)', '2026-09-07'::date, '2026-10-02'::date,
          m_abdelkader, 3001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_gra_1, 'I'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.3', 'Sub-hourly NGIAB images (15 and 5 minute)', '2026-09-21'::date, '2026-10-16'::date,
          m_abdelkader, 3002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_gra_1, 'I'),
    (tid, m_ui_co_is, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.4', 'TITO v0.2.0, runbook and interface screenshots', '2026-10-05'::date, '2026-11-13'::date,
          m_abdelkader, 3003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.6', 'Resolve the 15 vs 5 minute peak discrepancy', '2026-10-19'::date, '2026-11-06'::date,
          m_gra_1, 3004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.7', 'Calibrate the Little Sioux domain', '2026-10-19'::date, '2026-11-13'::date,
          m_gra_1, 3005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.8', 'Argon HPC run path (Apptainer) for large hindcasts', '2026-11-02'::date, '2026-11-27'::date,
          m_gra_1, 3006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.9', 'TITO v0.3: ensemble run manager, post-processor hook, NPET section', '2026-11-16'::date, '2026-12-18'::date,
          m_gra_1, 3007, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'C'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '3.10', 'TITO documentation and open source packaging', '2027-01-04'::date, '2027-01-22'::date,
          m_abdelkader, 3008, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_ui_co_is, 'I');

  -- 4.0 Objective 1, QPF post-processing
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '4.0', 'Objective 1, QPF post-processing', true, 4000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.1', 'Displacement sampling from AnaPrO in TITO (first version, Task 1.1)', '2026-09-14'::date, '2026-10-09'::date,
          m_abdelkader, 4001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.2', 'Historical HRRR and MRMS pairs for intensity error calibration (Task 1.1)', '2026-09-14'::date, '2026-10-16'::date,
          m_thielke, 4002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'I'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'R'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.3', 'CSGD fit and Gaussian copula perturbations (Task 1.1)', '2026-09-28'::date, '2026-10-30'::date,
          m_gra_2, 4003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'C'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.5', 'AnaPrO and StormLab post-processor packaged, deterministic and ensemble QPF (Task 1.1)', '2026-10-12'::date, '2026-11-06'::date,
          m_gra_2, 4004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.6', 'Downscaling of QPF error statistics to high resolution (Task 1.1, CU Boulder)', '2026-10-05'::date, '2026-11-06'::date,
          m_thielke, 4005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'I'),
    (tid, m_green, 'A'),
    (tid, m_thielke, 'R'),
    (tid, m_gra_2, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.7', 'ATRACKCS tracking, nowcast trajectories, short-term error features (Task 1.2)', '2026-09-21'::date, '2026-11-13'::date,
          m_gra_2, 4006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'I'),
    (tid, m_green, 'C'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.10', 'HRRR QPFs post-processed with the short-term characterization (Task 1.2)', '2026-10-19'::date, '2026-11-13'::date,
          m_gra_2, 4007, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'I'),
    (tid, m_gra_2, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.11', 'Bayesian fusion design and implementation (Task 1.3)', '2026-11-02'::date, '2026-12-11'::date,
          m_gra_2, 4008, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'I'),
    (tid, m_green, 'I'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '4.13', 'M2: error-correction procedure for HRRR QPFs working end to end', '2026-12-07'::date, '2026-12-11'::date,
          m_gra_2, 4009, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'I'),
    (tid, m_noaa_partners, 'I');

  -- 5.0 Objective 2, NextGen-compatible procedures
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '5.0', 'Objective 2, NextGen-compatible procedures', true, 5000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.1', 'Pre-processing module for rainfall forcings into the Forcing Engine (Task 2.1)', '2026-09-28'::date, '2026-10-30'::date,
          m_gra_1, 5001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'C'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.2', 'Python controller for iterative NextGen execution (Task 2.1)', '2026-10-12'::date, '2026-11-13'::date,
          m_gra_1, 5002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_gra_1, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.3', 'Module connected to the post-processor, documentation and tests (Task 2.1)', '2026-11-02'::date, '2026-12-04'::date,
          m_gra_1, 5003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.5', 'NPET review, adaptation to NextGen outputs, AnaPrO weighting (Task 2.2)', '2026-10-12'::date, '2026-12-11'::date,
          m_gra_1, 5004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'C'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'I'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.8', 'BMI compliance review of the pre and post-processing modules', '2026-11-16'::date, '2026-12-11'::date,
          m_ui_co_is, 5005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_gra_1, 'C'),
    (tid, m_ui_co_is, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '5.9', 'M3: prototype modules and NextGen workflow delivered', '2026-12-14'::date, '2026-12-18'::date,
          m_abdelkader, 5006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'I'),
    (tid, m_ui_co_is, 'I'),
    (tid, m_noaa_partners, 'I');

  -- 6.0 Objective 3, evaluation of strategies
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '6.0', 'Objective 3, evaluation of strategies', true, 6000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.1', 'First hourly cycle for June 2024 with all strategies (Task 3.1)', '2026-10-19'::date, '2026-11-06'::date,
          m_abdelkader, 6001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.2', 'Hourly 24 cycle and 15 minute hindcasts for June 2024 (Task 3.1)', '2026-11-02'::date, '2026-11-27'::date,
          m_gra_1, 6002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.4', 'Hindcasts for the other cases and NPET ensemble hindcasts (Task 3.1)', '2026-11-16'::date, '2026-12-18'::date,
          m_gra_1, 6003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'C'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.6', 'Rainfall to rainfall comparison against MRMS (Task 3.2)', '2026-11-16'::date, '2026-12-11'::date,
          m_gra_2, 6004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'C'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.7', 'Hydrologic verification and computational cost per strategy (Task 3.2)', '2026-11-30'::date, '2027-01-08'::date,
          m_gra_1, 6005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'I'),
    (tid, m_abdelkader, 'A'),
    (tid, m_green, 'C'),
    (tid, m_gra_1, 'R'),
    (tid, m_ui_co_is, 'C'),
    (tid, m_noaa_partners, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '6.9', 'Comparative assessment report and figures (Task 3.2, M4)', '2027-01-04'::date, '2027-01-15'::date,
          m_abdelkader, 6006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C'),
    (tid, m_noaa_partners, 'I');

  -- 7.0 Reporting, dissemination and closeout
  insert into tasks (project_id, wbs, title, is_summary, sort_order)
  values (pid, '7.0', 'Reporting, dissemination and closeout', true, 7000) returning id into gid;

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.1', 'Project update at the CIROH Science Meeting 2026 (lightning talk)', '2026-10-19'::date, '2026-10-30'::date,
          m_abdelkader, 7001, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'I'),
    (tid, m_ui_co_is, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.2', 'Monthly HydroShare reports and quarterly Smartsheet report', '2026-09-07'::date, '2027-01-29'::date,
          m_abdelkader, 7002, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'R'),
    (tid, m_thielke, 'I'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'I'),
    (tid, m_noaa_partners, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.6', 'Mentoring of the two GRAs', '2026-09-07'::date, '2027-01-29'::date,
          m_ui_co_is, 7003, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_gra_1, 'I'),
    (tid, m_gra_2, 'I'),
    (tid, m_ui_co_is, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.7', 'HydroLearn module on QPF uncertainty and storm tracking', '2026-12-07'::date, '2027-01-22'::date,
          m_gra_2, 7004, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'C'),
    (tid, m_green, 'I'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'R');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.8', 'Manuscript draft (Journal of Hydrometeorology or Journal of Hydrology)', '2027-01-04'::date, '2027-01-29'::date,
          m_abdelkader, 7005, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'R'),
    (tid, m_thielke, 'C'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'C');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.9', 'Conference abstracts and talks (AMS 2027, AGU, CIROH Developers Conference, R2O webinar)', '2026-11-02'::date, '2027-01-29'::date,
          m_abdelkader, 7006, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'R'),
    (tid, m_gra_1, 'C'),
    (tid, m_gra_2, 'C'),
    (tid, m_ui_co_is, 'I'),
    (tid, m_noaa_partners, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.10', 'Code and data release (GitHub, HydroShare, TRL documentation)', '2027-01-11'::date, '2027-01-29'::date,
          m_abdelkader, 7007, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'C'),
    (tid, m_gra_1, 'R'),
    (tid, m_gra_2, 'R'),
    (tid, m_ui_co_is, 'I'),
    (tid, m_noaa_partners, 'I');

  insert into tasks (project_id, parent_id, wbs, title, start_date, end_date,
                     owner_id, sort_order, pct_complete, status)
  values (pid, gid, '7.11', 'Final project report and closeout (M5)', '2027-01-18'::date, '2027-01-29'::date,
          m_abdelkader, 7008, 0, 'not_started') returning id into tid;
  insert into raci_assignments (task_id, member_id, letter) values
    (tid, m_vergara_pi, 'A'),
    (tid, m_abdelkader, 'R'),
    (tid, m_green, 'R'),
    (tid, m_thielke, 'C'),
    (tid, m_gra_1, 'C'),
    (tid, m_gra_2, 'C'),
    (tid, m_ui_co_is, 'C'),
    (tid, m_noaa_partners, 'I');

  -- ---------------------------------------------------------- milestones
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'M1', 'Cases selected and datasets collected', '2026-10-16'::date, m_abdelkader, 1000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'M2', 'Error-correction procedure for HRRR QPFs working end to end', '2026-12-11'::date, m_gra_2, 2000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'M3', 'Prototype modules and NextGen workflow delivered', '2026-12-18'::date, m_abdelkader, 3000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'M4', 'Evaluation of error-correction strategies for the selected cases', '2027-01-15'::date, m_abdelkader, 4000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'M5', 'Final report, manuscript draft and code release', '2027-01-29'::date, m_vergara_pi, 5000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'P1', 'Monthly progress report to OWP (September)', '2026-09-30'::date, m_vergara_pi, 6000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'P2', 'Monthly progress report to OWP (October)', '2026-10-30'::date, m_vergara_pi, 7000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'P3', 'Monthly progress report to OWP (November)', '2026-11-30'::date, m_vergara_pi, 8000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'P4', 'Quarterly report via CIROH Smartsheet, plus December monthly', '2026-12-18'::date, m_vergara_pi, 9000);
  insert into milestones (project_id, number, title, due_date, owner_id, sort_order)
  values (pid, 'P5', 'Monthly progress report (January) and closeout', '2027-01-29'::date, m_vergara_pi, 10000);

  -- --------------------------------------------------------- risk register
  insert into risks (project_id, risk_no, description, consequence, likelihood,
                     severity, mitigation, owner_id, status, sort_order)
  values (pid, '1.0', 'The five month window leaves no slack for any task to slip', 'Later objectives compress or are dropped, and there is no no-cost extension to absorb it', 4, 5,
          'Front load the software so Tasks 2.1, 3.1 and 3.2 share one orchestrator. Review the Gantt weekly and move scope rather than dates.', m_vergara_pi, 'open', 1000);
  insert into risks (project_id, risk_no, description, consequence, likelihood,
                     severity, mitigation, owner_id, status, sort_order)
  values (pid, '2.0', 'AnaPrO and MTD object data for cases other than June 2024 arrive late from CU Boulder', 'Task 1.1 stalls, and with it every hindcast that depends on corrected QPF', 3, 4,
          'The June 2024 archive is already in hand, so development proceeds on it while the rest is requested early.', m_green, 'open', 2000);
  insert into risks (project_id, risk_no, description, consequence, likelihood,
                     severity, mitigation, owner_id, status, sort_order)
  values (pid, '3.0', 'Archived HRRR or MRMS coverage proves incomplete for a selected case', 'That case drops out and the comparison rests on fewer events', 3, 3,
          'Case selection is driven by archive availability, and more cases are listed than are strictly needed.', m_thielke, 'open', 3000);
  insert into risks (project_id, risk_no, description, consequence, likelihood,
                     severity, mitigation, owner_id, status, sort_order)
  values (pid, '4.0', 'Sub-hourly NextGen runs on the full case set exceed the compute available', 'Hindcasts are reduced to hourly, weakening the sub-hourly argument', 3, 3,
          'Argon HPC path via Apptainer prepared early. Stage runs by case and clear intermediates.', m_abdelkader, 'open', 4000);
  insert into risks (project_id, risk_no, description, consequence, likelihood,
                     severity, mitigation, owner_id, status, sort_order)
  values (pid, '5.0', 'Graduate research assistant availability over the semester falls short of 75 percent', 'Objective 1 and the evaluation both slow, since the GRAs carry them', 3, 4,
          'Weekly meetings surface it early. Mentoring time is scheduled rather than assumed.', m_felipe_quintero, 'open', 5000);

  raise notice 'Loaded project 26-120: % tasks, % milestones, % risks.',
    (select count(*) from tasks where project_id = pid and not is_summary),
    (select count(*) from milestones where project_id = pid),
    (select count(*) from risks where project_id = pid);
end $$;

-- What landed, so you can check it without leaving the editor.
select 'tasks'      as what, count(*) from tasks      where project_id = (select id from projects where code = '26-120')
union all select 'groups',    count(*) from tasks      where project_id = (select id from projects where code = '26-120') and is_summary
union all select 'raci cells',count(*) from raci_assignments r join tasks t on t.id = r.task_id where t.project_id = (select id from projects where code = '26-120')
union all select 'members',   count(*) from project_members where project_id = (select id from projects where code = '26-120')
union all select 'milestones',count(*) from milestones where project_id = (select id from projects where code = '26-120')
union all select 'risks',     count(*) from risks      where project_id = (select id from projects where code = '26-120');
