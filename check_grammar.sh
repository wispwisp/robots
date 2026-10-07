#!/bin/bash
claude -p "Correct the following text using English grammar. You should correct it, explain my errors, and provide a corrected version. Use plain text in answer. Here is the text:\n\n $*" --model haiku
