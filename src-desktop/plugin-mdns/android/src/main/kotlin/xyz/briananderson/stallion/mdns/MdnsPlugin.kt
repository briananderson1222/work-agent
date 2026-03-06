package xyz.briananderson.stallion.mdns

import android.app.Activity
import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.net.InetAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@TauriPlugin
class MdnsPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val SERVICE_TYPE = "_stallion._tcp."
        private const val DISCOVER_TIMEOUT_MS = 3000L
    }

    @Command
    fun discover(invoke: Invoke) {
        val nsdManager = activity.getSystemService(Context.NSD_SERVICE) as NsdManager

        val found = mutableListOf<JSObject>()
        val pendingResolves = AtomicInteger(0)
        val latch = CountDownLatch(1)

        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {}

            override fun onServiceFound(service: NsdServiceInfo) {
                pendingResolves.incrementAndGet()
                nsdManager.resolveService(service, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                        if (pendingResolves.decrementAndGet() == 0 && latch.count > 0) {
                            latch.countDown()
                        }
                    }

                    override fun onServiceResolved(info: NsdServiceInfo) {
                        val host: InetAddress? = info.host
                        val port = info.port
                        if (host != null && port > 0) {
                            val url = "http://${host.hostAddress}:$port"
                            val obj = JSObject()
                            obj.put("url", url)
                            obj.put("name", info.serviceName ?: "Stallion Server")
                            obj.put("latency", 0)
                            synchronized(found) { found.add(obj) }
                        }
                        if (pendingResolves.decrementAndGet() == 0 && latch.count > 0) {
                            latch.countDown()
                        }
                    }
                })
            }

            override fun onServiceLost(service: NsdServiceInfo) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                latch.countDown()
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }

        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)

        // Wait up to DISCOVER_TIMEOUT_MS for at least one resolve, then stop
        latch.await(DISCOVER_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        nsdManager.stopServiceDiscovery(discoveryListener)

        val arr = JSArray()
        synchronized(found) { found.forEach { arr.put(it) } }
        // Tauri's invoke.resolve() expects JSObject, not JSArray.
        // Wrap the array in an object under a "servers" key.
        val result = JSObject()
        result.put("servers", arr)
        invoke.resolve(result)
    }
}
