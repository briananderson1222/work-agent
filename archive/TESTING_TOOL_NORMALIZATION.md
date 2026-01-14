# Testing Tool Name Normalization

## Setup

1. **Start the backend server:**
   ```bash
   npm run dev:server
   ```

2. **Start the frontend UI:**
   ```bash
   npm run dev:ui
   ```

## Test 1: Tool Display in Chat

**Objective**: Verify tool names display with server badge and clean tool name

**Steps**:
1. Open the UI at http://localhost:5173
2. Select an agent that uses MCP tools (e.g., `stallion-workspace:work-agent`)
3. Send a message that triggers a tool call (e.g., "What's on my calendar today?")
4. Observe the tool call display in the chat

**Expected Result**:
- Tool call should show: `[sat-outlook] calendar_view`
- NOT: `satOutlook_calendarView`
- Server badge should be in a gray rounded box
- Tool name should be in normal weight font

## Test 2: Tool Display in Agent Editor

**Objective**: Verify tools list shows server badges

**Steps**:
1. Navigate to Settings > Agents
2. Click "Edit" on an agent with MCP tools
3. Scroll to the "Tools" section
4. Observe the tool list

**Expected Result**:
- Each tool should show server badge (e.g., `[sat-outlook]`) followed by tool name
- Tools without server info should display normally

## Test 3: Nova Model Streaming

**Objective**: Verify Nova doesn't crash with normalized tool names

**Steps**:
1. Edit an agent to use Nova model:
   - Settings > Agents > Edit
   - Change model to: `us.amazon.nova-pro-v1:0`
   - Save
2. Send a message that triggers a tool call
3. Observe streaming response

**Expected Result**:
- No `NGHTTP2_INTERNAL_ERROR` crash
- Tool executes successfully
- Response streams normally

## Test 4: Multiple Tool Calls

**Objective**: Verify multiple tools display correctly

**Steps**:
1. Send a message that triggers multiple tool calls
2. Observe all tool displays in the chat

**Expected Result**:
- Each tool shows its own server badge
- Tool names are clean and readable
- No duplicate or missing information

## Verification Checklist

- [ ] Tool calls show server badge in chat
- [ ] Tool names are clean (no camelCase normalization visible)
- [ ] Agent editor shows server badges for tools
- [ ] Nova model doesn't crash with tool calls
- [ ] Multiple tool calls display correctly
- [ ] Tool approval flow still works
- [ ] Tool results display correctly

## Rollback

If issues are found, revert these commits:
- `src-ui/src/hooks/useStreamingMessage.ts`
- `src-ui/src/components/ChatDock.tsx`
- `src-ui/src/views/AgentEditorView.tsx`
