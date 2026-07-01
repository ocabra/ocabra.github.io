
# improving cifs.ko file read and write throughput under multichannel (part 1)

Server Message Block (SMB) protocol, in its 3.0 version, introduced
multichannel, which should serve the purpose of "increase network performance
and the availability of file servers".\[1\]

Multichannel is a file server functionality. The file server exposes to
the client multiple interfaces and the client can establish multiple network
connections simultanesously. According to \[1\], this should provide increased
throughput and network fault tolerance perceived by the file server. And that
makes sense at least for the server.

As for the server, it is clear to me that one should expect network fault
tolerance to be experienced by the client. Afterall, if one interface fails on
the server side, the client would be unable to communicate with that interface,
but nothing stops it from sending and receiving requests on the working
interface. \[2\]

It is not very clear to me, however, that the client should be able to
experience increased throughput. So that begs the question, can we expect
increased throughput to be experienced by the client? Why and why not?

To know this, we can simply measure the file IO under multichannel and see if
it increases throughput.

For this task, we can use fio. I had never used fio before and what I did was
<em>vibe code</em>\[3\] a script for me with a fio matrix so I
could test different cifs.ko configurations: mount with multichannel and mount
without multichannel, to see how they would compare.

Simple enough, I got the following results:

```
# TODO: results
```

Okay, so there isn't any visible difference in throughput, and this makes sense
at first because of the path from writeback_pages to server.

[TODO explain the path from vfs_write -> mm -> writeback_pages -> server]

So after this digression, I guess the question that remains is, is there room for improvement? 

## is there room for improvement?


-- 
\[1\] https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/manage-smb-multichannel
\[2\] Well, one could certainly expect, but that is not what was happening. A
      simple code refactor lead to a bug where a disconnected channel would not be skipped in
      the channel picking algorithm. I ended up fixing this on 79280191c2fd ("smb:
      client: fix cifs_pick_channel when channel needs reconnect").
\[3\] Honestly, I would never do this again. If I don't care about what I'm
      doing, sure, vibe code it. However, if I do care about it, I need to read
      the documentation first and craft it from start. Knowing this beforehand
      would have saved me hours if not days of wasted experiments because of
      bad code.
