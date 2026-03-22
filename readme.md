# FitGen App - Technical Overview

## 1. Introduction

FitGen is a React-based Progressive Web App (PWA) designed to generate personalized workout plans using AI and track user progress. The application is built with a focus on local-first architecture, persisting all data to `localStorage` to ensure offline capability and state retention.

## 2. Architecture & State Management

The application follows a centralized state management pattern rooted in the top-level `App` component. While it relies on React's `useState` for reactivity, it heavily synchronizes with the browser's `localStorage` to behave like a persistent application.

### Core Data Stores (LocalStorage Keys)

- `fitgen-user`: Authentication object (User ID/Email).
- `fitgen-profile`: User preferences (Goal, Equipment, Exclusions).
- `fitgen-plan`: The current active AI-generated workout program.
- `fitgen-history`: Array of completed workout logs.
- `fitgen-active`: Temporary state of a currently running workout (for crash recovery).

## 3. Component Breakdown

### 3.1 App.jsx (Root Controller)

The `App` component acts as the central store and router. It does not use a client-side router (like `react-router`); instead, it manages a `view` state string to conditionally render the main screen.

**State:**

- `user`: (Object|null) Current authenticated user.
- `view`: (String) Current active screen (`"welcome"`, `"plan"`, `"logs"`, `"profile"`, `"active"`).
- `isGuest`: (Boolean) Flag to bypass authentication.
- `profile`: (Object) User's specific fitness profile.
- `plan`: (Object) Deep object containing the multi-week workout schedule.
- `history`: (Array) List of finished workout objects.
- `activeWorkout`: (Object|null) If non-null, the user is in the middle of a session.

**Key Methods:**

- `handleSavePlan(plan, profile)`: Hydrates the app with a new plan and switches user to dashboard.
- `handleStartWorkout(day)`: Initializes `activeWorkout` and switches view to `"active"`.
- `handleFinishWorkout(log)`: Appends the session to `history`, clears `activeWorkout`, and saves everything.
- `handleGenerateNextWeek(feedback)`: Calls the AI service to append a new week to the existing `plan`.

### 3.2 Feature: Onboarding

**Component:** `ProfileSetupForm.jsx`
Responsible for the initial user flow. It collects user data in a wizard-like interface before the main app unlocks.

**State:**

- `step`: (Integer) Tracks current view in the 8-step wizard.
- `formData`: (Object) Accumulates answers (Goal, Experience Level, Days/Week, Equipment, etc.).
- `isGenerating`: (Boolean) UI loading state during AI generation.

**Methods:**

- `handleGenerate()`: Calls `utils/generateInitialPlan.js` -> `services/api/callModel`. On success, it calls `App.handleSavePlan`.

### 3.3 Feature: Dashboard

**Component:** `PlanDashboard.jsx`
The primary view for a user with an active plan. It displays the weekly schedule.

**State:**

- `weekIndex`: (Integer) Controls which week of the program is currently visible. Defaults to the latest week.
- `details`: (Object|null) If set, shows the `DayDetailModal` with exercise specifics.
- `showCheckin`: (Boolean) Toggles the feedback modal for generating the next week.

**Methods:**

- `handleCheckin(feedback)`: Orchestrates the AI call to generate the next week based on user feedback.

### 3.4 Feature: Active Session

**Component:** `ActiveWorkout.jsx`
The detailed view when a user is actually working out. It is designed to be resilient to page reloads.

**State:**

- `logs`: (Array) A deep copy of the workout template, hydrated with user inputs (reps/weight) and completion status.
- `timer`: (Integer) Seconds elapsed.
- `showConfirm`: (String|null) UI state for "Finish" vs "Exit" confirmations.

**Behavior:**

- **Auto-Save**: Uses a `useEffect` to write `logs` and `timer` to `localStorage` (`fitgen-active`) on _every change_. This ensures that if the browser refreshes, the workout acts as if it never stopped.

### 3.5 Feature: Authentication

**Component:** `AuthModal.jsx`
Handles login and signup forms.

**State:**

- `mode`: (`"login"`, `"signup"`, `"reset"`) Switches the form layout.
- `email`, `password`: Controlled inputs.

### 3.6 Utilities

- `utils/generateInitialPlan.js`: Constructs the detailed LLM prompt for the initial plan generation.
- `utils/generateNextWeekPlan.js`: Context-aware generation that reads previous weeks and user feedback.
