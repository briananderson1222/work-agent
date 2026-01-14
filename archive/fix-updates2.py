import re

with open('src-ui/src/App.tsx', 'r') as f:
    lines = f.readlines()

output = []
skip_until = -1
i = 0

while i < len(lines):
    line = lines[i]
    
    # Check if this line starts an updateSession call
    if 'updateSession(' in line and skip_until < i:
        # Collect the full call (may span multiple lines)
        call_lines = [line]
        paren_count = line.count('(') - line.count(')')
        j = i + 1
        while paren_count > 0 and j < len(lines):
            call_lines.append(lines[j])
            paren_count += lines[j].count('(') - lines[j].count(')')
            j += 1
        
        full_call = ''.join(call_lines)
        
        # Check what's being updated
        updates_messages = 'messages:' in full_call or 'messages =' in full_call
        updates_status = 'status:' in full_call and 'status =' not in full_call
        updates_conversationId = 'conversationId:' in full_call
        updates_title = 'title:' in full_call
        updates_model = 'model:' in full_call
        updates_ui_only = any(x in full_call for x in ['input:', 'attachments:', 'queuedMessages:', 'inputHistory:', 'hasUnread:', 'error:'])
        
        # If it only updates backend state, remove it
        if (updates_messages or updates_status or updates_conversationId or updates_title or updates_model) and not updates_ui_only:
            # Comment it out
            output.append(f"      // REMOVED: updateSession - data comes from ConversationsContext\n")
            skip_until = j - 1
            i = j
            continue
        
        # If it updates UI state, try to convert it
        if updates_ui_only:
            # Extract sessionId
            match = re.search(r'updateSession\((\w+),', full_call)
            if match:
                session_id = match.group(1)
                
                # Build updateChat call
                ui_updates = []
                if 'input:' in full_call:
                    input_match = re.search(r"input:\s*([^,}]+)", full_call)
                    if input_match:
                        ui_updates.append(f"input: {input_match.group(1).strip()}")
                
                if 'attachments:' in full_call:
                    att_match = re.search(r"attachments:\s*([^,}]+)", full_call)
                    if att_match:
                        ui_updates.append(f"attachments: {att_match.group(1).strip()}")
                
                if 'queuedMessages:' in full_call:
                    q_match = re.search(r"queuedMessages:\s*(\[[^\]]+\])", full_call)
                    if q_match:
                        ui_updates.append(f"queuedMessages: {q_match.group(1).strip()}")
                
                if 'inputHistory:' in full_call:
                    h_match = re.search(r"inputHistory:\s*(\[[^\]]+\])", full_call)
                    if h_match:
                        ui_updates.append(f"inputHistory: {h_match.group(1).strip()}")
                
                if 'hasUnread:' in full_call:
                    u_match = re.search(r"hasUnread:\s*(\w+)", full_call)
                    if u_match:
                        ui_updates.append(f"hasUnread: {u_match.group(1).strip()}")
                
                if 'error:' in full_call:
                    e_match = re.search(r"error:\s*([^,}]+)", full_call)
                    if e_match:
                        ui_updates.append(f"error: {e_match.group(1).strip()}")
                
                if ui_updates:
                    indent = ' ' * (len(line) - len(line.lstrip()))
                    output.append(f"{indent}updateChat({session_id}, {{ {', '.join(ui_updates)} }});\n")
                    skip_until = j - 1
                    i = j
                    continue
    
    if skip_until < i:
        output.append(line)
    i += 1

with open('src-ui/src/App.tsx', 'w') as f:
    f.writelines(output)

print("Replacement complete!")
